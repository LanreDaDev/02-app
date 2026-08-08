-- v1 Schema: Token-gated clip-based video generation
-- This migration drops the old domain tables and builds the v1 schema from scratch.

-- Drop old tables (order matters for FKs)
DROP TABLE IF EXISTS analytics_events CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS videos CASCADE;
DROP TABLE IF EXISTS order_photos CASCADE;
DROP TABLE IF EXISTS generation_jobs CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS source_type CASCADE;
DROP TYPE IF EXISTS video_format CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS generation_status CASCADE;

-- Rename profiles → users and strip unused columns
ALTER TABLE profiles RENAME TO users;

ALTER TABLE users
  DROP COLUMN IF EXISTS full_name,
  DROP COLUMN IF EXISTS company_name,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS avatar_url,
  DROP COLUMN IF EXISTS notification_preferences,
  DROP COLUMN IF EXISTS onboarding_completed,
  DROP COLUMN IF EXISTS onboarding_skipped,
  DROP COLUMN IF EXISTS social_media_links,
  DROP COLUMN IF EXISTS business_goals,
  DROP COLUMN IF EXISTS preferred_contact_method;

-- Ensure users has the columns we need
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name TEXT;

-- ============================================================================
-- NEW ENUMS
-- ============================================================================

CREATE TYPE token_reason AS ENUM (
  'signup_grant', 'generation', 'regeneration', 'purchase', 'refund'
);

CREATE TYPE job_type AS ENUM ('clip', 'regen', 'concat');

CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- ============================================================================
-- TOKEN SYSTEM
-- ============================================================================

CREATE TABLE token_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE token_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta_tokens INTEGER NOT NULL,
  reason token_reason NOT NULL,
  job_id UUID,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_token_transactions_user ON token_transactions(user_id, created_at DESC);

CREATE TRIGGER update_token_accounts_updated_at
  BEFORE UPDATE ON token_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PROJECTS & PHOTOS
-- ============================================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_projects_user ON projects(user_id, created_at DESC);

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_photos_project ON photos(project_id);

-- ============================================================================
-- GENERATION JOBS & CLIPS
-- ============================================================================

CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  config_json JSONB DEFAULT '{}'::jsonb,
  cost_tokens INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  result_s3_keys JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_generation_jobs_project ON generation_jobs(project_id, status);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);

CREATE TRIGGER update_generation_jobs_updated_at
  BEFORE UPDATE ON generation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- FK from token_transactions to generation_jobs (added after both exist)
ALTER TABLE token_transactions
  ADD CONSTRAINT fk_token_transactions_job
  FOREIGN KEY (job_id) REFERENCES generation_jobs(id) ON DELETE SET NULL;

CREATE TABLE clips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  duration_sec NUMERIC(6,2),
  resolution TEXT NOT NULL DEFAULT '1080p',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_clips_project ON clips(project_id, order_index);

-- ============================================================================
-- NOTIFICATIONS (rebuilt)
-- ============================================================================

CREATE TYPE notification_type AS ENUM (
  'job_succeeded', 'job_failed', 'tokens_low', 'purchase_confirmed'
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE token_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Token accounts: users read their own
CREATE POLICY "Users read own token account"
  ON token_accounts FOR SELECT USING (user_id = auth.uid());

-- Token transactions: users read their own
CREATE POLICY "Users read own transactions"
  ON token_transactions FOR SELECT USING (user_id = auth.uid());

-- Projects: users CRUD their own
CREATE POLICY "Users manage own projects"
  ON projects FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Photos: users manage within their projects
CREATE POLICY "Users manage own photos"
  ON photos FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Generation jobs: users read their own; service role updates
CREATE POLICY "Users read own jobs"
  ON generation_jobs FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users create own jobs"
  ON generation_jobs FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Service role updates jobs"
  ON generation_jobs FOR UPDATE USING (true) WITH CHECK (true);

-- Clips: users read within their projects
CREATE POLICY "Users read own clips"
  ON clips FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Notifications: users read their own
CREATE POLICY "Users manage own notifications"
  ON notifications FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- SIGNUP GRANT: auto-create token account when user is created
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user_tokens()
RETURNS TRIGGER AS $$
DECLARE
  grant_amount INTEGER := COALESCE(current_setting('app.signup_grant_tokens', true)::integer, 1200);
BEGIN
  INSERT INTO token_accounts (user_id, balance_tokens)
  VALUES (NEW.id, grant_amount);

  INSERT INTO token_transactions (user_id, delta_tokens, reason)
  VALUES (NEW.id, grant_amount, 'signup_grant');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_created_grant_tokens
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_tokens();
