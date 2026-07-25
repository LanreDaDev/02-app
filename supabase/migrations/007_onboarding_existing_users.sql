-- ============================================================================
-- ADD ONBOARDING_REMINDER TO NOTIFICATION TYPES
-- ============================================================================

-- Add 'onboarding_reminder' to the notification_type enum
-- This must be done in a separate migration from using it due to PostgreSQL transaction requirements
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'onboarding_reminder';

-- Note: Notifications for existing users to complete onboarding can be created manually
-- after this migration completes, or users will naturally discover onboarding through the UI.
--
-- To manually create notifications after this migration, run:
--
-- INSERT INTO notifications (user_id, type, title, message, action_url, read)
-- SELECT
--   id,
--   'onboarding_reminder'::notification_type,
--   'Complete Your Profile',
--   'Help us serve you better! Tell us about your business and goals.',
--   '/onboarding',
--   FALSE
-- FROM profiles
-- WHERE created_at < NOW() - INTERVAL '1 hour'
--   AND onboarding_completed = FALSE
--   AND onboarding_skipped = FALSE;
