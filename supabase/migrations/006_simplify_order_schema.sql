-- ============================================================================
-- SIMPLIFY ORDER SCHEMA FOR NEW WORKFLOW
-- ============================================================================

-- Make old fields nullable for backwards compatibility
ALTER TABLE orders
  ALTER COLUMN property_address DROP NOT NULL,
  ALTER COLUMN source_type DROP NOT NULL;

-- Add new simplified fields
ALTER TABLE orders
  ADD COLUMN video_instructions TEXT,
  ADD COLUMN contact_phone TEXT,
  ADD COLUMN contact_email TEXT;

-- Indexes for new contact fields
CREATE INDEX idx_orders_contact_phone ON orders(contact_phone) WHERE contact_phone IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN orders.video_instructions IS
  'Plain text instructions for video creation (replaces source_type, music_preference, voiceover fields)';

COMMENT ON COLUMN orders.contact_phone IS
  'Phone number for SMS updates (pulled from profile, can be overridden per order)';

COMMENT ON COLUMN orders.contact_email IS
  'Email for updates (pulled from profile.email, can be overridden)';
