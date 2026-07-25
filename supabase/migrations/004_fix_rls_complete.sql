-- ============================================================================
-- DROP ALL EXISTING POLICIES
-- ============================================================================

-- Drop all profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Drop all credits policies
DROP POLICY IF EXISTS "Users can view own credits" ON credits;
DROP POLICY IF EXISTS "Admins can view all credits" ON credits;
DROP POLICY IF EXISTS "Admins can insert credits" ON credits;

-- Drop all subscriptions policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can create own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

-- Drop all orders policies
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Users can update own draft orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;

-- Drop all order_photos policies
DROP POLICY IF EXISTS "Users can view own order photos" ON order_photos;
DROP POLICY IF EXISTS "Admins can view all order photos" ON order_photos;
DROP POLICY IF EXISTS "Users can insert own order photos" ON order_photos;
DROP POLICY IF EXISTS "Users can delete own order photos" ON order_photos;

-- Drop all videos policies
DROP POLICY IF EXISTS "Users can view own videos" ON videos;
DROP POLICY IF EXISTS "Admins can view all videos" ON videos;
DROP POLICY IF EXISTS "Admins can insert videos" ON videos;
DROP POLICY IF EXISTS "Admins can update videos" ON videos;

-- Drop all payments policies
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Users can create own payments" ON payments;

-- Drop all notifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can create notifications" ON notifications;

-- Drop all chat_messages policies
DROP POLICY IF EXISTS "Users can view own chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Admins can view all chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can send chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Admins can send admin chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can update own chat messages" ON chat_messages;

-- Drop all analytics_events policies
DROP POLICY IF EXISTS "Users can insert own analytics events" ON analytics_events;
DROP POLICY IF EXISTS "Admins can view all analytics events" ON analytics_events;

-- ============================================================================
-- CREATE ADMIN CHECK FUNCTION (SECURITY DEFINER to avoid recursion)
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
-- PROFILES POLICIES (NO RECURSION)
-- ============================================================================

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================================
-- CREDITS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Admins can insert credits"
  ON credits FOR INSERT
  WITH CHECK (is_admin());

-- ============================================================================
-- SUBSCRIPTIONS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can create own subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can create own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own draft orders"
  ON orders FOR UPDATE
  USING ((auth.uid() = user_id AND status = 'draft') OR is_admin());

-- ============================================================================
-- ORDER_PHOTOS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own order photos"
  ON order_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_photos.order_id
        AND orders.user_id = auth.uid()
    ) OR is_admin()
  );

CREATE POLICY "Users can insert own order photos"
  ON order_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_photos.order_id
        AND orders.user_id = auth.uid()
    )
  );

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

CREATE POLICY "Users can view own videos"
  ON videos FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Admins can insert videos"
  ON videos FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update videos"
  ON videos FOR UPDATE
  USING (is_admin());

-- ============================================================================
-- PAYMENTS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can create own payments"
  ON payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- NOTIFICATIONS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (is_admin());

-- ============================================================================
-- CHAT_MESSAGES POLICIES
-- ============================================================================

CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can send chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_admin = FALSE);

CREATE POLICY "Admins can send admin chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Users can update own chat messages"
  ON chat_messages FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- ============================================================================
-- ANALYTICS_EVENTS POLICIES
-- ============================================================================

CREATE POLICY "Users can insert own analytics events"
  ON analytics_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can view all analytics events"
  ON analytics_events FOR SELECT
  USING (is_admin());
