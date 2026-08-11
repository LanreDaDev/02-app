-- ============================================================================
-- 022: release projects trapped in 'draft'
-- ============================================================================
--
-- projects.status defaults to 'draft' and nothing has ever moved it off.
--
-- The editor reads it as "this project has not finished its upload step" and
-- redirects such a project back to /dashboard/projects/new?resume=<id>. The
-- batch confirm step that used to advance the status was removed along with the
-- derived-clip model; the handler kept the navigation and lost the update.
--
-- The result is a closed loop. Create a project, upload photos, press Create My
-- Video, land on the editor for long enough for it to read the status, and get
-- sent back to the upload page. Every project ever created is in this state, so
-- the editor has never once been reachable through the front door.
--
-- The app fix stops new projects from getting stuck. This releases the ones that
-- already are: any project with at least one photo has finished uploading, by
-- definition. Projects with no photos are left alone — resuming the upload step
-- is genuinely the right thing for those, which is what the check was for.

UPDATE projects p
SET status = 'editing',
    updated_at = NOW()
WHERE p.status = 'draft'
  AND EXISTS (SELECT 1 FROM photos ph WHERE ph.project_id = p.id);

COMMENT ON COLUMN projects.status IS
  '''draft'' means the upload step is unfinished and the editor will redirect '
  'back to it. Anything else opens the editor. Set to ''editing'' when the '
  'agent leaves the upload step.';
