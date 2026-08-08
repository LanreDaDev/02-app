-- User preferences: default video format + notification toggles
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  default_aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  notify_job_completed BOOLEAN NOT NULL DEFAULT TRUE,
  notify_tokens_low BOOLEAN NOT NULL DEFAULT TRUE,
  notify_purchase_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences"
  ON user_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-create preferences row on user creation
CREATE OR REPLACE FUNCTION handle_new_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_created_preferences
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_preferences();

-- Backfill existing users
INSERT INTO user_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
