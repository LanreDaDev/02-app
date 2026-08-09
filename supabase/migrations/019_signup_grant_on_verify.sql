-- 019: grant signup tokens on EMAIL VERIFICATION, not on account creation
--
-- 800 tokens is two clips — roughly $2 of real model spend per signup, funded as
-- marketing. Granting it the moment a row appears means a throwaway address is
-- worth $2, and scripted signups are worth as much as someone cares to script.
--
-- Moving the grant behind email confirmation costs a legitimate user nothing
-- (they confirm anyway to sign in) while making each free grant cost an attacker
-- a working, deliverable inbox.

-- ============================================================================
-- Account is created empty
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user_tokens()
RETURNS TRIGGER AS $$
BEGIN
  -- Balance starts at zero. The signup grant now arrives via
  -- grant_signup_bonus_on_verify below, once the email is confirmed.
  INSERT INTO token_accounts (user_id, balance_tokens)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Grant once, on first confirmation
-- ============================================================================
-- Idempotency key is the user id, so the unique index on
-- token_transactions.idempotency_key makes a double-grant impossible however
-- many times the trigger fires.

CREATE OR REPLACE FUNCTION grant_signup_bonus()
RETURNS TRIGGER AS $$
DECLARE
  v_grant INTEGER := COALESCE(NULLIF(current_setting('app.signup_grant_tokens', true), '')::INTEGER, 800);
BEGIN
  -- Only when confirmation actually transitions from unset to set.
  IF NEW.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO token_transactions (user_id, delta_tokens, reason, idempotency_key)
  VALUES (NEW.id, v_grant, 'signup_grant', 'signup_grant:' || NEW.id)
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Only move the balance if the ledger row was actually new.
  IF FOUND THEN
    INSERT INTO token_accounts (user_id, balance_tokens)
    VALUES (NEW.id, v_grant)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_tokens = token_accounts.balance_tokens + EXCLUDED.balance_tokens;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_email_confirmed_grant_tokens ON auth.users;

CREATE TRIGGER on_email_confirmed_grant_tokens
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION grant_signup_bonus();

-- ============================================================================
-- Backfill: don't punish people who signed up under the old rule
-- ============================================================================
-- Anyone already confirmed keeps whatever they have. Anyone confirmed but with
-- no signup_grant row (i.e. created between this migration and the trigger
-- firing) gets it now.

INSERT INTO token_transactions (user_id, delta_tokens, reason, idempotency_key)
SELECT u.id, 800, 'signup_grant', 'signup_grant:' || u.id
  FROM auth.users u
 WHERE u.email_confirmed_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM token_transactions t
      WHERE t.user_id = u.id AND t.reason = 'signup_grant'
   )
ON CONFLICT (idempotency_key) DO NOTHING;

-- Reconcile balances for exactly those backfilled rows.
UPDATE token_accounts a
   SET balance_tokens = a.balance_tokens + 800
  FROM token_transactions t
 WHERE t.user_id = a.user_id
   AND t.reason = 'signup_grant'
   AND t.idempotency_key = 'signup_grant:' || a.user_id
   AND t.created_at > NOW() - INTERVAL '1 minute';

COMMENT ON FUNCTION grant_signup_bonus() IS
  'Grants the signup token bonus once, on email confirmation. Keyed on user id so it cannot double-grant.';
