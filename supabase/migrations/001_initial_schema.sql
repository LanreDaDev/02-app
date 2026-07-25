-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types/enums
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE order_status AS ENUM ('draft', 'pending', 'in_progress', 'revision_requested', 'completed', 'cancelled');
CREATE TYPE source_type AS ENUM ('photos_only', 'photos_floor_plan', 'matterport');
CREATE TYPE video_format AS ENUM ('16x9', '9x16', '1x1');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE notification_type AS ENUM ('order_update', 'video_completed', 'credit_expiry', 'chat_message', 'payment_received');

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  company_name TEXT,
  phone TEXT,
  role user_role DEFAULT 'user' NOT NULL,
  avatar_url TEXT,
  notification_preferences JSONB DEFAULT '{"email": true, "push": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for lookups
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================================================
-- CREDITS TABLE
-- ============================================================================
CREATE TABLE credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positive = credit added, negative = credit used
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL, -- e.g., "5-pack purchase", "Video order deduction", "Producer Plan monthly"
  expires_at TIMESTAMPTZ, -- credits expire after 3 months
  order_id UUID, -- reference to order if credit was used for an order
  payment_id UUID, -- reference to payment if credit was purchased
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_credits_user_id ON credits(user_id);
CREATE INDEX idx_credits_expires_at ON credits(expires_at);
CREATE INDEX idx_credits_order_id ON credits(order_id);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL, -- e.g., "Producer Plan Monthly", "Producer Plan Annual"
  status subscription_status DEFAULT 'active' NOT NULL,
  credits_per_month INTEGER NOT NULL, -- 5 for Producer Plan
  price_per_month INTEGER NOT NULL, -- in cents: 105000 for monthly, 87500 for annual
  billing_cycle TEXT NOT NULL, -- 'monthly' or 'annual'
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Property details
  property_address TEXT NOT NULL,
  property_city TEXT,
  property_state TEXT,
  property_zip TEXT,
  mls_link TEXT,

  -- Order configuration
  source_type source_type DEFAULT 'photos_only' NOT NULL,
  price_cents INTEGER NOT NULL, -- 22500 for photos, 25500 for floor plan, 40000 for matterport
  include_voiceover BOOLEAN DEFAULT FALSE,
  voiceover_script TEXT,
  music_preference TEXT, -- e.g., "upbeat", "calm", "cinematic"
  special_instructions TEXT,

  -- Order status
  status order_status DEFAULT 'draft' NOT NULL,
  admin_notes TEXT,
  estimated_completion TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Revision tracking
  revision_count INTEGER DEFAULT 0,
  revision_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- ============================================================================
-- ORDER_PHOTOS TABLE
-- ============================================================================
CREATE TABLE order_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER, -- in bytes
  width INTEGER,
  height INTEGER,
  order_index INTEGER, -- for sorting photos
  is_floor_plan BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_order_photos_order_id ON order_photos(order_id);
CREATE INDEX idx_order_photos_order_index ON order_photos(order_id, order_index);

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Video file details
  format video_format NOT NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  mux_playback_id TEXT, -- for streaming preview
  file_size INTEGER, -- in bytes
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,

  -- Metadata
  thumbnail_url TEXT,
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_videos_order_id ON videos(order_id);
CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_format ON videos(format);

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Payment details
  amount_cents INTEGER NOT NULL,
  status payment_status DEFAULT 'pending' NOT NULL,
  payment_method TEXT, -- e.g., "card", "bank"

  -- Stripe integration
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  stripe_invoice_id TEXT,

  -- What was purchased
  description TEXT NOT NULL, -- e.g., "Single video order", "5-pack purchase", "Producer Plan - Monthly"
  order_id UUID REFERENCES orders(id),
  subscription_id UUID REFERENCES subscriptions(id),
  credits_added INTEGER, -- how many credits this payment added

  -- Receipt
  receipt_url TEXT,
  invoice_pdf_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_payment_intent ON payments(stripe_payment_intent_id);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Notification content
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT, -- e.g., "/dashboard/orders/123" or "/dashboard/videos/456"

  -- State
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  -- Related entities
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================================
-- CHAT_MESSAGES TABLE
-- ============================================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Message content
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE, -- true if message is from support team
  admin_id UUID REFERENCES profiles(id), -- which admin sent the message

  -- Attachments
  attachment_url TEXT,
  attachment_type TEXT, -- e.g., "image", "file"

  -- State
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_read ON chat_messages(user_id, read);

-- ============================================================================
-- ANALYTICS TABLE (for tracking user behavior)
-- ============================================================================
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Event details
  event_name TEXT NOT NULL, -- e.g., "video_viewed", "order_created", "credit_purchased"
  event_data JSONB, -- flexible data storage

  -- Context
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX idx_analytics_created_at ON analytics_events(created_at DESC);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTION TO GET USER CREDIT BALANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_credits INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO total_credits
  FROM credits
  WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW());

  RETURN GREATEST(total_credits, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION TO ADD CREDITS
-- ============================================================================

CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_payment_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_balance INTEGER;
  credit_id UUID;
BEGIN
  -- Calculate new balance
  new_balance := get_user_credit_balance(p_user_id) + p_amount;

  -- Insert credit transaction
  INSERT INTO credits (user_id, amount, balance_after, reason, expires_at, payment_id)
  VALUES (p_user_id, p_amount, new_balance, p_reason, p_expires_at, p_payment_id)
  RETURNING id INTO credit_id;

  RETURN credit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION TO DEDUCT CREDITS (for orders)
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_order_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- Get current balance
  current_balance := get_user_credit_balance(p_user_id);

  -- Check if user has enough credits
  IF current_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  -- Calculate new balance
  new_balance := current_balance - p_amount;

  -- Insert deduction transaction (negative amount)
  INSERT INTO credits (user_id, amount, balance_after, reason, order_id)
  VALUES (p_user_id, -p_amount, new_balance, p_reason, p_order_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
