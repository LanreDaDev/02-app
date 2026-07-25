-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - FIXED VERSION
-- ============================================================================

-- First, drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

DROP POLICY IF EXISTS "Users can view own credits" ON credits;
DROP POLICY IF EXISTS "Admins can view all credits" ON credits;
DROP POLICY IF EXISTS "Admins can insert credits" ON credits;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can create own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Users can update own draft orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES (NO RECURSION)
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- HELPER FUNCTION TO CHECK ADMIN (uses direct role check)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CREDITS POLICIES
-- ============================================================================

-- Users can view their own credits
CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Admins can insert credits
CREATE POLICY "Admins can insert credits"
  ON credits FOR INSERT
  WITH CHECK (is_admin());

-- ============================================================================
-- SUBSCRIPTIONS POLICIES
-- ============================================================================

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Users can create their own subscriptions
CREATE POLICY "Users can create own subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Users can view their own orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Users can create their own orders
CREATE POLICY "Users can create own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own draft orders
CREATE POLICY "Users can update own draft orders"
  ON orders FOR UPDATE
  USING ((auth.uid() = user_id AND status = 'draft') OR is_admin());

-- ============================================================================
-- ORDER_PHOTOS POLICIES
-- ============================================================================

-- Users can view photos for their own orders
CREATE POLICY "Users can view own order photos"
  ON order_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_photos.order_id
        AND orders.user_id = auth.uid()
    ) OR is_admin()
  );

-- Users can insert photos for their own orders
CREATE POLICY "Users can insert own order photos"
  ON order_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_photos.order_id
        AND orders.user_id = auth.uid()
    )
  );

-- Users can delete photos from their own draft orders
CREATE POLICY "Users can delete own order photos"
  ON order_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_photos.order_id
        AND orders.user_id = auth.uid()
        AND orders.status = 'draft'
    )
  );

-- ============================================================================
-- VIDEOS POLICIES
-- ============================================================================

-- Users can view their own videos
CREATE POLICY "Users can view own videos"
  ON videos FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Only admins can insert videos
CREATE POLICY "Admins can insert videos"
  ON videos FOR INSERT
  WITH CHECK (is_admin());

-- Only admins can update videos
CREATE POLICY "Admins can update videos"
  ON videos FOR UPDATE
  USING (is_admin());

-- ============================================================================
-- PAYMENTS POLICIES
-- ============================================================================

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Users can create their own payments
CREATE POLICY "Users can create own payments"
  ON payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- NOTIFICATIONS POLICIES
-- ============================================================================

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can create notifications for any user
CREATE POLICY "Admins can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (is_admin());

-- ============================================================================
-- CHAT_MESSAGES POLICIES
-- ============================================================================

-- Users can view their own chat messages
CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Users can send chat messages
CREATE POLICY "Users can send chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_admin = FALSE);

-- Admins can send chat messages as admin
CREATE POLICY "Admins can send admin chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (is_admin());

-- Users can update their own messages (mark as read)
CREATE POLICY "Users can update own chat messages"
  ON chat_messages FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- ============================================================================
-- ANALYTICS_EVENTS POLICIES
-- ============================================================================

-- Users can insert their own analytics events
CREATE POLICY "Users can insert own analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Admins can view all analytics events
CREATE POLICY "Admins can view all analytics events"
  ON analytics_events FOR SELECT
  USING (is_admin());
