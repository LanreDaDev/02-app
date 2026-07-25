// Database types for TypeScript
export type UserRole = 'user' | 'admin'

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'in_progress'
  | 'revision_requested'
  | 'completed'
  | 'cancelled'

export type SourceType = 'photos_only' | 'photos_floor_plan' | 'matterport'

export type VideoFormat = '16x9' | '9x16' | '1x1'

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired'

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export type NotificationType =
  | 'order_update'
  | 'video_completed'
  | 'credit_expiry'
  | 'chat_message'
  | 'payment_received'

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface Profile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  phone: string | null
  role: UserRole
  avatar_url: string | null
  notification_preferences: {
    email: boolean
    push: boolean
  }
  onboarding_completed: boolean
  onboarding_skipped: boolean
  social_media_links: {
    x?: string
    instagram?: string
    linkedin?: string
    facebook?: string
    website?: string
    [key: string]: string | undefined
  }
  business_goals: string | null
  preferred_contact_method: 'email' | 'sms' | 'both'
  created_at: string
  updated_at: string
}

export interface Credit {
  id: string
  user_id: string
  amount: number
  balance_after: number
  reason: string
  expires_at: string | null
  order_id: string | null
  payment_id: string | null
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  plan_name: string
  status: SubscriptionStatus
  credits_per_month: number
  price_per_month: number
  billing_cycle: string
  stripe_subscription_id: string | null
  current_period_start: string
  current_period_end: string
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  user_id: string
  property_address: string | null
  property_city: string | null
  property_state: string | null
  property_zip: string | null
  mls_link: string | null
  source_type: SourceType | null
  price_cents: number
  include_voiceover: boolean
  voiceover_script: string | null
  music_preference: string | null
  special_instructions: string | null
  video_instructions: string | null
  contact_phone: string | null
  contact_email: string | null
  status: OrderStatus
  admin_notes: string | null
  estimated_completion: string | null
  completed_at: string | null
  revision_count: number
  revision_notes: string | null
  created_at: string
  updated_at: string
}

export interface OrderPhoto {
  id: string
  order_id: string
  s3_key: string
  s3_url: string
  file_name: string
  file_size: number | null
  width: number | null
  height: number | null
  order_index: number | null
  is_floor_plan: boolean
  uploaded_at: string
}

export interface Video {
  id: string
  order_id: string
  user_id: string
  format: VideoFormat
  s3_key: string
  s3_url: string
  mux_playback_id: string | null
  file_size: number | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  thumbnail_url: string | null
  view_count: number
  download_count: number
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  user_id: string
  amount_cents: number
  status: PaymentStatus
  payment_method: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_invoice_id: string | null
  description: string
  order_id: string | null
  subscription_id: string | null
  credits_added: number | null
  receipt_url: string | null
  invoice_pdf_url: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  action_url: string | null
  read: boolean
  read_at: string | null
  order_id: string | null
  video_id: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  user_id: string
  message: string
  is_admin: boolean
  admin_id: string | null
  attachment_url: string | null
  attachment_type: string | null
  read: boolean
  read_at: string | null
  created_at: string
}

export interface AnalyticsEvent {
  id: string
  user_id: string | null
  event_name: string
  event_data: Record<string, any> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ============================================================================
// JOIN TYPES
// ============================================================================

export interface OrderWithPhotos extends Order {
  photos: OrderPhoto[]
}

export interface OrderWithVideos extends Order {
  videos: Video[]
}

export interface OrderWithEverything extends Order {
  photos: OrderPhoto[]
  videos: Video[]
  user: Profile
}

export interface VideoWithOrder extends Video {
  order: Order
}

// ============================================================================
// ONBOARDING TYPES
// ============================================================================

export interface OnboardingFormData {
  full_name: string
  company_name?: string
  phone?: string
  social_media_links: {
    x?: string
    instagram?: string
    linkedin?: string
    facebook?: string
    website?: string
  }
  business_goals: string
  preferred_contact_method: 'email' | 'sms' | 'both'
}

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

export const PRICING = {
  SINGLE_VIDEO: {
    photos_only: 22500, // $225
    photos_floor_plan: 25500, // $255
    matterport: 40000, // $400
  },
  FIVE_PACK: {
    total: 105000, // $1,050
    per_video: 21000, // $210
    credits: 5,
  },
  PRODUCER_PLAN: {
    monthly: 105000, // $1,050/mo
    annual: 87500, // $875/mo (billed annually)
    credits_per_month: 5,
  },
  REVISION: 2500, // $25 per additional revision after 2 free
} as const

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function getOrderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    draft: 'Draft',
    pending: 'Pending',
    in_progress: 'In Progress',
    revision_requested: 'Revision Requested',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return labels[status]
}

export function getSourceTypeLabel(sourceType: SourceType): string {
  const labels: Record<SourceType, string> = {
    photos_only: 'Listing Photos',
    photos_floor_plan: 'Photos + Floor Plan',
    matterport: 'Matterport Scan',
  }
  return labels[sourceType]
}

export function getVideoFormatLabel(format: VideoFormat): string {
  const labels: Record<VideoFormat, string> = {
    '16x9': 'Landscape (16:9)',
    '9x16': 'Vertical (9:16)',
    '1x1': 'Square (1:1)',
  }
  return labels[format]
}
