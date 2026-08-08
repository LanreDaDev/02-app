export type UserRole = 'user' | 'admin'

export type TokenReason =
  | 'signup_grant'
  | 'generation'
  | 'regeneration'
  | 'purchase'
  | 'admin_grant'

export type JobType = 'clip' | 'regen' | 'concat'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

/** Generation-graph job state. 'waiting' is clip-only: dependencies unmet. */
export type GraphJobStatus = 'waiting' | 'queued' | 'running' | 'succeeded' | 'failed'

export type VideoResolution = '1080p' | '4k'

export type ReframeOutcome =
  | 'generated_clean'
  | 'generated_corrected'
  | 'crop_fallthrough'
  | 'crop_gen_failed'
  | 'crop_validate_failed'

export type NotificationType =
  | 'job_succeeded'
  | 'job_failed'
  | 'tokens_low'
  | 'purchase_confirmed'

export interface User {
  id: string
  email: string
  name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface TokenAccount {
  id: string
  user_id: string
  balance_tokens: number
  created_at: string
  updated_at: string
}

export interface TokenTransaction {
  id: string
  user_id: string
  delta_tokens: number
  reason: TokenReason
  job_id: string | null
  idempotency_key: string | null
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  status: string
  aspect_ratio: '9:16' | '16:9'
  created_at: string
  updated_at: string
}

export interface Photo {
  id: string
  project_id: string
  s3_key: string
  s3_url: string
  file_name: string
  file_size: number | null
  width: number | null
  height: number | null
  selected: boolean
  order_index: number | null
  created_at: string
}

export interface GenerationJob {
  id: string
  project_id: string
  type: JobType
  status: JobStatus
  config_json: Record<string, unknown>
  cost_tokens: number
  cost_usd_estimate: number | null
  cost_usd_actual: number | null
  idempotency_key: string | null
  result_s3_keys: Record<string, string> | null
  attempts: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface Clip {
  id: string
  project_id: string
  job_id: string
  s3_key: string
  s3_url: string
  order_index: number
  duration_sec: number | null
  resolution: VideoResolution
  is_current: boolean
  superseded_at: string | null
  created_at: string
}

export interface ImageJob {
  id: string
  project_id: string
  photo_id: string
  order_index: number
  status: GraphJobStatus
  attempts: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ClipJob {
  id: string
  project_id: string
  order_index: number
  dep_start_index: number
  dep_end_index: number
  status: GraphJobStatus
  cost_tokens: number
  cost_usd_estimate: number | null
  cost_usd_actual: number | null
  mux_asset_id: string | null
  mux_playback_id: string | null
  idempotency_key: string | null
  is_current: boolean
  superseded_at: string | null
  attempts: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface Reframe {
  id: string
  project_id: string
  photo_id: string
  s3_key: string
  outcome: ReframeOutcome
  created_at: string
}

export interface Video {
  id: string
  project_id: string
  /** Durable download artifact. */
  s3_key: string
  /** Streamable copy of the same render, for in-app playback. */
  mux_asset_id: string | null
  mux_playback_id: string | null
  aspect_ratio: '16:9' | '9:16'
  created_at: string
}

export interface DailySpend {
  date: string
  reserved_usd: number
  actual_usd: number
}

export interface UserPreferences {
  id: string
  user_id: string
  default_aspect_ratio: '9:16' | '16:9'
  notify_job_completed: boolean
  notify_tokens_low: boolean
  notify_purchase_confirmed: boolean
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  project_id: string | null
  type: NotificationType
  title: string
  message: string
  read: boolean
  created_at: string
}
