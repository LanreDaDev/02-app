-- 020: authored slots replace derived clips
--
-- The agent now builds one clip at a time: choose a photo (or two), pick how the
-- camera moves, generate, look at it, regenerate if it's wrong, then start the
-- next. Clips are no longer computed from a photo sequence.
--
-- This deletes more than it adds. The dependency graph existed only because a
-- clip was defined by position — clip i ran still i to still i+1 — which is what
-- made the fan-out, the gating and the shared-boundary optimisation necessary.
-- A slot depends solely on its own one or two stills, so the whole apparatus
-- goes and the work collapses into a single task per generation.

-- ============================================================================
-- Photos can now come from a finished clip, not just an upload
-- ============================================================================
-- Chaining a slot to the previous one extracts the last video frame and uses it
-- as the next start image. That frame is an ordinary input photo: it is reframed
-- like any other, which is what the reframe is for — quality and consistent
-- sizing, not something specific to camera output.

CREATE TYPE photo_source AS ENUM ('upload', 'extracted_frame');

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS source photo_source NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS derived_from_clip_job_id UUID;

COMMENT ON COLUMN photos.derived_from_clip_job_id IS
  'For source=extracted_frame: the clip whose final frame this is. Deliberately not a FK — the frame outlives the take it came from.';

-- The library shows uploads; extracted frames appear only as slot inputs.
CREATE INDEX IF NOT EXISTS idx_photos_project_source
  ON photos (project_id, source);

-- ============================================================================
-- Slots
-- ============================================================================

CREATE TYPE slot_kind AS ENUM ('still', 'generated');

CREATE TYPE still_motion AS ENUM ('none', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right');

CREATE TABLE slots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- How the agent finds this among twenty near-identical thumbnails.
  -- "Kitchen", "Primary bedroom". Defaults to Clip 1, Clip 2 on creation and
  -- deliberately does NOT renumber on reorder.
  name          TEXT NOT NULL DEFAULT 'Clip',

  kind          slot_kind NOT NULL DEFAULT 'generated',

  -- Rail order. Distinct from timeline order, which lives in
  -- projects.composition — a clip can be moved on the timeline without
  -- disturbing the grouping the agent built.
  position      INTEGER NOT NULL DEFAULT 0,

  -- Required for both kinds. For a still this is simply the photo shown.
  start_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,

  -- Two frames means FFLF; one means the camera moves within a single shot.
  end_photo_id   UUID REFERENCES photos(id) ON DELETE SET NULL,

  -- Generated only.
  camera_motion      TEXT,
  motion_aggression  INTEGER NOT NULL DEFAULT 50
                     CHECK (motion_aggression BETWEEN 0 AND 100),
  -- The lengths the model produces. Priced at 100 tokens/second.
  duration_seconds   INTEGER NOT NULL DEFAULT 4
                     CHECK (duration_seconds IN (4, 6, 8)),

  -- Still only. Unbounded on purpose: there is no underlying take to trim
  -- against, so a still is the one thing that resizes freely — which is what
  -- makes it the release valve when narration overruns.
  hold_duration_seconds NUMERIC(6,2) NOT NULL DEFAULT 3,
  still_motion          still_motion NOT NULL DEFAULT 'zoom_in',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A still is one photo held; it can never have a second frame.
  CONSTRAINT still_has_no_end_frame
    CHECK (kind = 'generated' OR end_photo_id IS NULL),

  CONSTRAINT frames_differ
    CHECK (end_photo_id IS NULL OR end_photo_id <> start_photo_id)
);

CREATE INDEX idx_slots_project_position ON slots (project_id, position);

CREATE TRIGGER update_slots_updated_at
  BEFORE UPDATE ON slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own slots"
  ON slots FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- ============================================================================
-- clip_jobs become takes belonging to a slot
-- ============================================================================
-- A clip_job already carried everything a take needs — Mux ids, cost, status,
-- is_current. It was only ever missing an owner. Superseded rows have been takes
-- all along; they simply had no way to be reached.

ALTER TABLE clip_jobs
  ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES slots(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 4,
  -- What the take was actually generated with, so the panel can say which
  -- parameter changed since — and so a take's provenance survives edits.
  ADD COLUMN IF NOT EXISTS params JSONB;

COMMENT ON COLUMN clip_jobs.is_current IS
  'The active take for this slot. Switching takes is instant — no generation.';

-- Order came from the derived model. Rail order is slots.position; timeline
-- order is projects.composition. Neither belongs on a take.
ALTER TABLE clip_jobs
  DROP COLUMN IF EXISTS dep_start_index,
  DROP COLUMN IF EXISTS dep_end_index;

DROP INDEX IF EXISTS idx_clip_jobs_current_per_slot;
DROP INDEX IF EXISTS idx_clip_jobs_waiting_deps;
DROP INDEX IF EXISTS idx_clip_jobs_project_order;

-- Exactly one active take per slot.
CREATE UNIQUE INDEX idx_clip_jobs_active_take
  ON clip_jobs (slot_id)
  WHERE is_current = TRUE;

CREATE INDEX idx_clip_jobs_slot ON clip_jobs (slot_id, created_at DESC);

-- ============================================================================
-- The dependency graph goes
-- ============================================================================
-- A slot's generation reframes its own one or two photos and then makes the
-- clip, in one task. Nothing waits on anything outside itself.

DROP FUNCTION IF EXISTS satisfy_clip_dependencies(UUID, INTEGER);

-- image_jobs goes too. A reframe was a separately tracked job because clips
-- waited on it; now it happens inside the slot's own task, so the clip's status
-- already covers it. What a reframe produced is still recorded — that is what
-- the reframes table is for, including the outcome that tells you whether the
-- OBVIOUS gate is calibrated.
DROP TABLE IF EXISTS image_jobs CASCADE;

-- 'waiting' described a clip whose two images had not both landed. Nothing
-- waits any more. The value stays in the enum (Postgres cannot drop one) but is
-- no longer written.
COMMENT ON TYPE graph_job_status IS
  'queued -> running -> succeeded | failed. ''waiting'' is vestigial: it belonged to the derived-clip dependency graph removed in 020.';

-- ============================================================================
-- Photo selection was a batch concept
-- ============================================================================
-- Slots choose their own photos, so there is nothing to confirm up front. The
-- column stays for now so uploads keep working unchanged; it stops being read.

COMMENT ON COLUMN photos.selected IS
  'Vestigial after 020. Slots reference photos directly; there is no confirm step.';
