-- Self-serve video generation schema
-- Adds generation_jobs table and adapts order_photos for session-based uploads

-- Generation status enum
CREATE TYPE generation_status AS ENUM ('queued', 'processing', 'completed', 'failed');

-- Generation jobs table
CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  status generation_status DEFAULT 'queued' NOT NULL,
  error_message TEXT,

  config JSONB DEFAULT '{}'::jsonb,
  input_image_keys TEXT[] NOT NULL,

  output_video_s3_key TEXT,
  output_video_url TEXT,
  output_thumbnail_url TEXT,
  duration_seconds INTEGER,

  queued_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX idx_generation_jobs_created_at ON generation_jobs(created_at DESC);

CREATE TRIGGER update_generation_jobs_updated_at
  BEFORE UPDATE ON generation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Adapt order_photos for session-based uploads
ALTER TABLE order_photos
  ADD COLUMN session_id UUID,
  ADD COLUMN selected_for_video BOOLEAN DEFAULT FALSE,
  ADD COLUMN display_order INTEGER DEFAULT 0;

ALTER TABLE order_photos
  ALTER COLUMN order_id DROP NOT NULL;

CREATE INDEX idx_order_photos_session_id ON order_photos(session_id) WHERE session_id IS NOT NULL;

-- RLS for generation_jobs
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own generation jobs"
  ON generation_jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own generation jobs"
  ON generation_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can update any generation job"
  ON generation_jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);
