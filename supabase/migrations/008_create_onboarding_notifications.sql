-- ============================================================================
-- CREATE ONBOARDING NOTIFICATIONS FOR EXISTING USERS
-- ============================================================================

-- Create notification for existing users (created more than 1 hour ago)
-- to prompt them to complete onboarding
INSERT INTO notifications (user_id, type, title, message, action_url, read)
SELECT
  id,
  'onboarding_reminder'::notification_type,
  'Complete Your Profile',
  'Help us serve you better! Tell us about your business and goals.',
  '/onboarding',
  FALSE
FROM profiles
WHERE created_at < NOW() - INTERVAL '1 hour'
  AND onboarding_completed = FALSE
  AND onboarding_skipped = FALSE;

-- Note: New users will be redirected to onboarding automatically via auth callback
-- This migration only creates notifications for existing users
