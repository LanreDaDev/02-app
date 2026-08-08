import { createClient } from '@supabase/supabase-js'
import type { TokenReason } from '@/lib/types/database'

export const TOKENS_PER_CLIP = parseInt(process.env.TOKENS_PER_CLIP || '400', 10)
export const CLIP_USD_ESTIMATE = parseFloat(process.env.CLIP_USD_ESTIMATE || '2.58')
export const DAILY_SPEND_CEILING_USD = parseFloat(
  process.env.DAILY_SPEND_CEILING_USD || '0'
)

/**
 * Outcome of an atomic ledger call. Mirrors the JSONB returned by the
 * `debit_tokens` / `credit_tokens` Postgres functions (migration 015).
 *
 * Nothing is written unless the status is 'ok'. Branch on it — never assume.
 */
export type DebitOutcome =
  | { status: 'ok'; balance: number; transactionId: string }
  | { status: 'replay'; balance: number }
  | { status: 'insufficient'; balance: number; required: number }
  | { status: 'ceiling_exceeded'; reserved: number; ceiling: number }

export type CreditOutcome = { status: 'ok' | 'replay'; balance: number }

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getBalance(userId: string): Promise<number> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('token_accounts')
    .select('balance_tokens')
    .eq('user_id', userId)
    .single()

  return data?.balance_tokens ?? 0
}

/**
 * Spend tokens. Balance check, ledger insert, and daily-spend reservation all
 * happen inside one database transaction, with the balance guarded by a
 * conditional UPDATE (`WHERE balance_tokens >= amount`).
 *
 * Pass `usdEstimate` to reserve against the daily circuit breaker in the same
 * transaction — do NOT reserve separately beforehand, or it double-counts.
 */
export async function debitTokens(
  userId: string,
  amount: number,
  reason: TokenReason,
  opts: {
    jobId?: string
    idempotencyKey?: string
    usdEstimate?: number
  } = {}
): Promise<DebitOutcome> {
  const supabase = getServiceClient()

  const { data, error } = await supabase.rpc('debit_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_usd_estimate: opts.usdEstimate ?? 0,
    p_ceiling_usd: DAILY_SPEND_CEILING_USD,
    p_job_id: opts.jobId ?? null,
  })

  if (error) throw new Error(`debit_tokens failed: ${error.message}`)

  return data as DebitOutcome
}

/**
 * Add tokens (purchase, admin grant). Atomic for the same reason the debit is:
 * two concurrent credits read-then-writing would silently drop one.
 */
export async function creditTokens(
  userId: string,
  amount: number,
  reason: TokenReason,
  idempotencyKey?: string
): Promise<CreditOutcome> {
  const supabase = getServiceClient()

  const { data, error } = await supabase.rpc('credit_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_idempotency_key: idempotencyKey ?? null,
  })

  if (error) throw new Error(`credit_tokens failed: ${error.message}`)

  return data as CreditOutcome
}

export async function grantTokens(
  userId: string,
  amount: number,
  adminId: string
): Promise<CreditOutcome> {
  return creditTokens(
    userId,
    amount,
    'admin_grant',
    `admin_grant:${adminId}:${userId}:${Date.now()}`
  )
}

/**
 * Replace a clip's reservation with what it actually cost.
 *
 * `reserved_usd` deliberately does NOT unwind to zero here — it accumulates as
 * the day's best-known spend, which is what DAILY_SPEND_CEILING_USD caps. (The
 * previous behaviour subtracted the whole estimate, which turned the breaker
 * into an in-flight concurrency limit and left daily spend uncapped.)
 */
export async function reconcileDailySpend(
  estimatedUsd: number,
  actualUsd: number
): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase.rpc('reconcile_daily_spend', {
    p_estimate: estimatedUsd,
    p_actual: actualUsd,
  })
  if (error) throw new Error(`reconcile_daily_spend failed: ${error.message}`)
}

/**
 * Hand back reserved USD headroom for a clip that was debited but never
 * dispatched. Spend accounting only — this is not a token refund.
 */
export async function releaseDailySpend(estimatedUsd: number): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase.rpc('release_daily_spend', {
    p_estimate: estimatedUsd,
  })
  if (error) console.error('release_daily_spend failed:', error.message)
}

/** Read-only breaker check. The authoritative test runs inside `debitTokens`. */
export async function checkDailySpendCeiling(): Promise<boolean> {
  if (!DAILY_SPEND_CEILING_USD) return false

  const supabase = getServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await supabase
    .from('daily_spend')
    .select('reserved_usd')
    .eq('date', today)
    .single()

  return (data?.reserved_usd ?? 0) >= DAILY_SPEND_CEILING_USD
}

/** True when the user has hit their hourly clip allowance. */
export async function checkUserRateLimit(userId: string): Promise<boolean> {
  const maxPerHour = parseInt(process.env.MAX_GENERATIONS_PER_HOUR || '30', 10)
  const supabase = getServiceClient()

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId)

  if (!projects || projects.length === 0) return false

  // Metered in clips, which is what actually costs money.
  const { count } = await supabase
    .from('clip_jobs')
    .select('*', { count: 'exact', head: true })
    .in(
      'project_id',
      projects.map((p) => p.id)
    )
    .gte('created_at', oneHourAgo)

  return (count ?? 0) >= maxPerHour
}
