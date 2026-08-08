-- 017: persist the timeline edit, and retire the pre-graph tables
--
-- The user's edit — clip order plus in/out points — IS the Remotion composition.
-- There is no separate edit-decision export: finalize renders exactly this. It
-- lives on the project so it survives a reload and so Lambda can be handed the
-- same object the editor was driving.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS composition JSONB,
  ADD COLUMN IF NOT EXISTS composition_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.composition IS
  'Remotion composition the user edited: { fps, width, height, clips: [{ clipJobId, orderIndex, inFrame, outFrame }] }. Rendered as-is by finalize.';

-- ============================================================================
-- Finalized render: one row per project, two destinations
-- ============================================================================
-- S3 holds the durable download file; Mux serves the in-app stream. Same render,
-- ingested twice — never rendered twice.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS render_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'rendering',
  ADD COLUMN IF NOT EXISTS duration_sec NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- s3_key is only known once the render finishes.
ALTER TABLE videos ALTER COLUMN s3_key DROP NOT NULL;

-- ============================================================================
-- Retire the pre-graph tables
-- ============================================================================
-- `generation_jobs` and `clips` were the flat pre-dependency-graph model,
-- replaced by image_jobs + clip_jobs in 016. Nothing reads them any more.
--
-- DESTRUCTIVE. Check what you'd lose before running:
--   SELECT (SELECT count(*) FROM clips) AS clips,
--          (SELECT count(*) FROM generation_jobs) AS jobs;
-- The end-to-end pipeline never ran against these (the two services couldn't
-- talk), so in practice they hold test rows only.

DROP TABLE IF EXISTS clips CASCADE;
DROP TABLE IF EXISTS generation_jobs CASCADE;

DROP TYPE IF EXISTS job_type;
DROP TYPE IF EXISTS job_status;
