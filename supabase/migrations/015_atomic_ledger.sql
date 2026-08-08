-- 015: atomic token ledger + correct daily-spend circuit breaker
--
-- Replaces the read-then-write balance handling in lib/tokens.ts with database
-- functions that do the whole debit/credit in ONE transaction. The conditional
-- UPDATE (`WHERE balance_tokens >= :cost`) is the concurrency guard: two parallel
-- requests can no longer both read the same balance and both spend it.
--
-- Also fixes the circuit breaker. Previously `reconcile` subtracted the full
-- estimate from reserved_usd, so reserved unwound to ~0 as clips completed and
-- the ceiling only ever capped IN-FLIGHT spend, never the day's total. Reconcile
-- now swaps the estimate for the actual, leaving reserved_usd as today's
-- best-known spend — which is what DAILY_SPEND_CEILING_USD is meant to cap.

-- ============================================================================
-- Balance floor: the backstop underneath the conditional debit
-- ============================================================================

ALTER TABLE token_accounts
  ADD CONSTRAINT token_accounts_balance_non_negative
  CHECK (balance_tokens >= 0);

-- ============================================================================
-- debit_tokens — atomic spend
-- ============================================================================
-- Returns one of:
--   {"status":"ok",              "balance":n, "transaction_id":uuid}
--   {"status":"replay",          "balance":n}                        idempotency key already used
--   {"status":"insufficient",    "balance":n, "required":n}          balance too low
--   {"status":"ceiling_exceeded","reserved":n, "ceiling":n}          daily USD cap hit
--
-- Callers must branch on status. Nothing is written unless status is "ok".

CREATE OR REPLACE FUNCTION debit_tokens(
  p_user_id         UUID,
  p_amount          INTEGER,
  p_reason          token_reason,
  p_idempotency_key TEXT DEFAULT NULL,
  p_usd_estimate    NUMERIC DEFAULT 0,
  p_ceiling_usd     NUMERIC DEFAULT 0,
  p_job_id          UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today    DATE := CURRENT_DATE;
  v_reserved NUMERIC;
  v_balance  INTEGER;
  v_tx_id    UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'debit_tokens: amount must be positive (got %)', p_amount;
  END IF;

  -- Replay check. The unique index on idempotency_key is the real guard (see the
  -- unique_violation handler below); this is the fast path for an obvious repeat.
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM token_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      SELECT COALESCE(balance_tokens, 0) INTO v_balance
        FROM token_accounts WHERE user_id = p_user_id;
      RETURN jsonb_build_object('status', 'replay', 'balance', COALESCE(v_balance, 0));
    END IF;
  END IF;

  -- Circuit breaker. Lock today's row so a parallel burst is serialized here and
  -- can't collectively overshoot the ceiling.
  IF p_usd_estimate > 0 THEN
    INSERT INTO daily_spend (date) VALUES (v_today) ON CONFLICT (date) DO NOTHING;

    SELECT reserved_usd INTO v_reserved
      FROM daily_spend WHERE date = v_today FOR UPDATE;

    IF p_ceiling_usd > 0 AND (v_reserved + p_usd_estimate) > p_ceiling_usd THEN
      RETURN jsonb_build_object(
        'status',   'ceiling_exceeded',
        'reserved', v_reserved,
        'ceiling',  p_ceiling_usd
      );
    END IF;
  END IF;

  -- THE concurrency guard. Zero rows updated => insufficient balance, and the
  -- balance was never read into application space where it could go stale.
  UPDATE token_accounts
     SET balance_tokens = balance_tokens - p_amount
   WHERE user_id = p_user_id
     AND balance_tokens >= p_amount
  RETURNING balance_tokens INTO v_balance;

  IF NOT FOUND THEN
    SELECT COALESCE(balance_tokens, 0) INTO v_balance
      FROM token_accounts WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'status',   'insufficient',
      'balance',  COALESCE(v_balance, 0),
      'required', p_amount
    );
  END IF;

  INSERT INTO token_transactions (user_id, delta_tokens, reason, job_id, idempotency_key)
  VALUES (p_user_id, -p_amount, p_reason, p_job_id, p_idempotency_key)
  RETURNING id INTO v_tx_id;

  IF p_usd_estimate > 0 THEN
    UPDATE daily_spend
       SET reserved_usd = reserved_usd + p_usd_estimate
     WHERE date = v_today;
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance, 'transaction_id', v_tx_id);

EXCEPTION WHEN unique_violation THEN
  -- Two identical requests raced past the replay check. The unique index rejected
  -- this one; the exception block rolls back THIS call's debit entirely, so the
  -- winner's debit stands and the loser reports a replay. Never double-charges.
  SELECT COALESCE(balance_tokens, 0) INTO v_balance
    FROM token_accounts WHERE user_id = p_user_id;
  RETURN jsonb_build_object('status', 'replay', 'balance', COALESCE(v_balance, 0));
END;
$$;

-- ============================================================================
-- credit_tokens — atomic top-up (Stripe purchase, signup grant, admin grant)
-- ============================================================================
-- Same lost-update risk as the debit path, in the direction that loses a paying
-- customer's tokens. Returns {"status":"ok"|"replay", "balance":n}.

CREATE OR REPLACE FUNCTION credit_tokens(
  p_user_id         UUID,
  p_amount          INTEGER,
  p_reason          token_reason,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_tokens: amount must be positive (got %)', p_amount;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM token_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      SELECT COALESCE(balance_tokens, 0) INTO v_balance
        FROM token_accounts WHERE user_id = p_user_id;
      RETURN jsonb_build_object('status', 'replay', 'balance', COALESCE(v_balance, 0));
    END IF;
  END IF;

  INSERT INTO token_transactions (user_id, delta_tokens, reason, idempotency_key)
  VALUES (p_user_id, p_amount, p_reason, p_idempotency_key);

  -- Upsert so a credit can't be lost if the account row is somehow missing.
  INSERT INTO token_accounts (user_id, balance_tokens)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance_tokens = token_accounts.balance_tokens + EXCLUDED.balance_tokens
  RETURNING balance_tokens INTO v_balance;

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);

EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(balance_tokens, 0) INTO v_balance
    FROM token_accounts WHERE user_id = p_user_id;
  RETURN jsonb_build_object('status', 'replay', 'balance', COALESCE(v_balance, 0));
END;
$$;

-- ============================================================================
-- Daily spend reconciliation
-- ============================================================================

-- Swap the reservation for what the clip actually cost. reserved_usd therefore
-- tracks today's real spend rather than unwinding to zero, so the ceiling caps
-- the DAY. Note: a clip reserved just before UTC midnight reconciles against the
-- new day's row — a rounding error at this volume, not worth a per-job date.
CREATE OR REPLACE FUNCTION reconcile_daily_spend(
  p_estimate NUMERIC,
  p_actual   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO daily_spend (date) VALUES (CURRENT_DATE) ON CONFLICT (date) DO NOTHING;

  UPDATE daily_spend
     SET reserved_usd = GREATEST(0, reserved_usd - p_estimate + p_actual),
         actual_usd   = actual_usd + p_actual
   WHERE date = CURRENT_DATE;
END;
$$;

-- Give back a reservation when a clip is never actually dispatched (service
-- unreachable, job insert failed). This releases USD headroom only — it is NOT a
-- token refund, which the spec rules out.
CREATE OR REPLACE FUNCTION release_daily_spend(p_estimate NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE daily_spend
     SET reserved_usd = GREATEST(0, reserved_usd - p_estimate)
   WHERE date = CURRENT_DATE;
END;
$$;

-- ============================================================================
-- Grants: service role only. These bypass RLS by design (SECURITY DEFINER), so
-- they must never be callable by an end user's anon/authenticated session.
-- ============================================================================

REVOKE ALL ON FUNCTION debit_tokens(UUID, INTEGER, token_reason, TEXT, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION credit_tokens(UUID, INTEGER, token_reason, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reconcile_daily_spend(NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_daily_spend(NUMERIC) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION debit_tokens(UUID, INTEGER, token_reason, TEXT, NUMERIC, NUMERIC, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION credit_tokens(UUID, INTEGER, token_reason, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_daily_spend(NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION release_daily_spend(NUMERIC) TO service_role;
