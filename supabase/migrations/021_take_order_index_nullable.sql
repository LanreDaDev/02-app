-- ============================================================================
-- 021: clip_jobs.order_index stops being required
-- ============================================================================
--
-- Generation has been failing on every attempt with "Could not start
-- generating" — a 500 from POST /api/generate, raised when the clip_jobs insert
-- comes back with an error.
--
-- The insert was fine. The column was:
--
--   016 created clip_jobs.order_index as INTEGER NOT NULL with no default,
--       because in the derived model a clip WAS its index.
--
--   020 made clip_jobs into takes belonging to a slot, and said so directly —
--       "Order came from the derived model. Rail order is slots.position;
--       timeline order is projects.composition. Neither belongs on a take." It
--       dropped dep_start_index and dep_end_index on exactly that reasoning and
--       left order_index in place.
--
-- So the table still demanded a number that nothing computes any more, and
-- /api/generate correctly does not send one. Every take insert violated the
-- constraint. Nothing reached the box, no clip was ever dispatched, and the
-- tokens were released again on the way out — so this cost nothing but it also
-- generated nothing.
--
-- It survived review because the ClipJob TypeScript interface has no
-- order_index at all. The insert reads as complete; the type and the table
-- disagreed, and only the table gets a vote.
--
-- Dropped to nullable rather than dropped outright, deliberately. A deployed
-- build still SELECTs this column in the finalize route, and removing it while
-- that build is live would trade a broken generate for a broken export. This
-- change is safe against both the old code and the new.
--
-- Follow-up: once the deploy carrying the matching app change is live, drop the
-- column. It has no readers left.

ALTER TABLE clip_jobs
  ALTER COLUMN order_index DROP NOT NULL;

COMMENT ON COLUMN clip_jobs.order_index IS
  'Vestigial — from the derived-clip model removed in 020. Rail order is '
  'slots.position, timeline order is projects.composition. Nothing writes this. '
  'Safe to drop once no deployed build still selects it.';
