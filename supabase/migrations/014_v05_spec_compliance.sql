-- v0.5 spec compliance: enum fix, missing tables, partial unique index

-- ============================================================================
-- Fix token_reason enum: replace 'refund' with 'admin_grant'
-- ============================================================================

ALTER TYPE token_reason RENAME VALUE 'refund' TO 'admin_grant';

-- ============================================================================
-- Add is_current to clips + partial unique index
-- ============================================================================

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clips_current_per_slot
  ON clips (project_id, order_index)
  WHERE is_current = TRUE;

-- ============================================================================
-- reframes table
-- ============================================================================

CREATE TYPE reframe_outcome AS ENUM (
  'generated_clean',
  'generated_corrected',
  'crop_fallthrough',
  'crop_gen_failed',
  'crop_validate_failed'
);

CREATE TABLE reframes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  outcome reframe_outcome NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (project_id, photo_id)
);

CREATE INDEX idx_reframes_project ON reframes(project_id);

ALTER TABLE reframes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reframes"
  ON reframes FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ============================================================================
-- videos table (finalized renders)
-- ============================================================================

CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX idx_videos_project ON videos(project_id);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own videos"
  ON videos FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ============================================================================
-- daily_spend table (two-phase spend tracking)
-- ============================================================================

CREATE TABLE daily_spend (
  date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  reserved_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  actual_usd NUMERIC(12,4) NOT NULL DEFAULT 0
);

ALTER TABLE daily_spend ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Add cost_usd columns to generation_jobs
-- ============================================================================

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS cost_usd_estimate NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS cost_usd_actual NUMERIC(10,4);

-- ============================================================================
-- Fix signup grant to 800 tokens
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user_tokens()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO token_accounts (user_id, balance_tokens)
  VALUES (NEW.id, 800);

  INSERT INTO token_transactions (user_id, delta_tokens, reason)
  VALUES (NEW.id, 800, 'signup_grant');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
