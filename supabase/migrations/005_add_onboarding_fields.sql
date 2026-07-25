-- ============================================================================
-- ADD ONBOARDING FIELDS TO PROFILES
-- ============================================================================

-- Add onboarding fields to profiles table
ALTER TABLE profiles
  ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN onboarding_skipped BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN social_media_links JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN business_goals TEXT,
  ADD COLUMN preferred_contact_method TEXT DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'sms', 'both'));

-- Add X/Twitter to social media (X, Instagram, LinkedIn, Facebook, Website)
COMMENT ON COLUMN profiles.social_media_links IS
  'JSON object: {"x": "url", "instagram": "url", "linkedin": "url", "facebook": "url", "website": "url"}';

COMMENT ON COLUMN profiles.business_goals IS
  'User-provided goals for using Olade videos, collected during onboarding';

COMMENT ON COLUMN profiles.preferred_contact_method IS
  'Preferred method for receiving order updates: email, sms, or both';

-- Index for checking onboarding status (partial index for efficiency)
CREATE INDEX idx_profiles_onboarding ON profiles(id, onboarding_completed)
  WHERE onboarding_completed = FALSE;
