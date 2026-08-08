-- 016: the dependency-gated generation graph
--
-- Replaces the flat `generation_jobs` + `clips` model with the two job tables the
-- architecture actually needs:
--
--   image_jobs  one per selected photo. Reframes it, writes the still to S3.
--               Runs in parallel with every other image job.
--   clip_jobs   one per clip. Records the TWO image indices it depends on and
--               starts in 'waiting'. When both are done it flips to 'queued' and
--               dispatches. Because still[i+1] is clip[i]'s end AND clip[i+1]'s
--               start, and that still is ONE image_job, it is never generated twice.
--
-- This migration is additive. The old `generation_jobs` and `clips` tables stay in
-- place until the API routes are rewritten off them; migration 017 drops them.

-- ============================================================================
-- Status enum
-- ============================================================================
-- A new type rather than adding 'waiting' to `job_status`: ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that adds it, and the old enum stays in
-- use by generation_jobs until 017 anyway.

CREATE TYPE graph_job_status AS ENUM (
  'waiting',    -- clip only: dependencies not yet satisfied
  'queued',     -- dispatched to Celery
  'running',
  'succeeded',
  'failed'
);

-- ============================================================================
-- image_jobs
-- ============================================================================

CREATE TABLE image_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  photo_id      UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  order_index   INTEGER NOT NULL,
  status        graph_job_status NOT NULL DEFAULT 'queued',
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One reframe job per photo per project. Makes resume idempotent: re-running
  -- /api/generate cannot enqueue a second reframe for a photo already handled.
  UNIQUE (project_id, photo_id)
);

CREATE INDEX idx_image_jobs_project_order ON image_jobs (project_id, order_index);
CREATE INDEX idx_image_jobs_status ON image_jobs (status) WHERE status <> 'succeeded';

CREATE TRIGGER update_image_jobs_updated_at
  BEFORE UPDATE ON image_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- clip_jobs
-- ============================================================================

CREATE TABLE clip_jobs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_index        INTEGER NOT NULL,

  -- The two image order_indexes this clip is gated on. For clip i these are
  -- i and i+1 — the shared-boundary relationship, recorded explicitly so the
  -- dependency check never has to infer it.
  dep_start_index    INTEGER NOT NULL,
  dep_end_index      INTEGER NOT NULL,

  status             graph_job_status NOT NULL DEFAULT 'waiting',

  cost_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_usd_estimate  NUMERIC(10,4),
  cost_usd_actual    NUMERIC(10,4),

  -- Working video asset lives in Mux, not S3. asset_id comes back from the direct
  -- upload; playback_id arrives later via the Mux webhook once encoding finishes.
  mux_asset_id       TEXT,
  mux_playback_id    TEXT,

  -- `clip:{project_id}:{index}` for a first generation, and a distinct key per
  -- regeneration. Unique, so a double-submit cannot create two paid jobs.
  idempotency_key    TEXT UNIQUE,

  -- A regen supersedes the clip in this slot rather than mutating it, so the
  -- timeline always has exactly one live clip per index.
  is_current         BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_at      TIMESTAMPTZ,

  attempts           INTEGER NOT NULL DEFAULT 0,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (dep_end_index > dep_start_index)
);

-- Exactly one live clip per slot. Superseded rows keep their history.
CREATE UNIQUE INDEX idx_clip_jobs_current_per_slot
  ON clip_jobs (project_id, order_index)
  WHERE is_current = TRUE;

CREATE INDEX idx_clip_jobs_project_order ON clip_jobs (project_id, order_index);

-- Supports the dependency check: "which waiting clips depend on image N?"
CREATE INDEX idx_clip_jobs_waiting_deps
  ON clip_jobs (project_id, dep_start_index, dep_end_index)
  WHERE status = 'waiting';

CREATE TRIGGER update_clip_jobs_updated_at
  BEFORE UPDATE ON clip_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- videos: the final render lands in BOTH places
-- ============================================================================
-- S3 holds the durable download artifact; Mux serves the in-app stream. One
-- render, two destinations — not two renders.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS mux_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT;

-- ============================================================================
-- token_transactions.job_id now points at clip_jobs
-- ============================================================================
-- Drop the FK to generation_jobs rather than repoint it: the ledger is
-- append-only and must survive whatever the job tables do. The spec defines
-- job_id as a plain nullable reference, not an enforced constraint.

ALTER TABLE token_transactions
  DROP CONSTRAINT IF EXISTS fk_token_transactions_job;

-- ============================================================================
-- Dependency satisfaction
-- ============================================================================
-- Called when an image job succeeds. Flips every clip whose BOTH dependencies
-- are now done from 'waiting' to 'queued' and returns them, so the caller
-- dispatches exactly the clips this image unblocked — and only once, because the
-- UPDATE ... WHERE status = 'waiting' is itself the claim.
--
-- The shared boundary still means completing image N can release two clips at
-- once (clip N-1, which ends on it, and clip N, which starts on it). Both come
-- back in one call.

CREATE OR REPLACE FUNCTION satisfy_clip_dependencies(
  p_project_id  UUID,
  p_order_index INTEGER
)
RETURNS TABLE (
  clip_job_id     UUID,
  order_index     INTEGER,
  dep_start_index INTEGER,
  dep_end_index   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE clip_jobs c
     SET status = 'queued'
   WHERE c.project_id = p_project_id
     AND c.status = 'waiting'
     AND c.is_current = TRUE
     AND (c.dep_start_index = p_order_index OR c.dep_end_index = p_order_index)
     -- both dependencies must have succeeded, not just this one
     AND NOT EXISTS (
       SELECT 1
         FROM (VALUES (c.dep_start_index), (c.dep_end_index)) AS deps(idx)
        WHERE NOT EXISTS (
          SELECT 1 FROM image_jobs i
           WHERE i.project_id = c.project_id
             AND i.order_index = deps.idx
             AND i.status = 'succeeded'
        )
     )
  RETURNING c.id, c.order_index, c.dep_start_index, c.dep_end_index;
END;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE image_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own image jobs"
  ON image_jobs FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users read own clip jobs"
  ON clip_jobs FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

REVOKE ALL ON FUNCTION satisfy_clip_dependencies(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION satisfy_clip_dependencies(UUID, INTEGER) TO service_role;
