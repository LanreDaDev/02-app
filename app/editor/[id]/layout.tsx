import ProtectedRoute from "@/components/auth/ProtectedRoute";

/**
 * The editor's own layout.
 *
 * Deliberately not under /dashboard. That layout centres its children in a
 * 1200px <main> with padding and stacks a nav above them, which is right for
 * the dashboard and wrong for a tool that has to own the viewport — inside it
 * the rail, stage and timeline were boxed into a column and could not reach
 * full height.
 *
 * Dark, because the editor is a place for looking: the listing photography has
 * to be the brightest thing on screen. The timeline inverts back to light
 * inside this (see .light in globals.css) — it is operated rather than watched.
 *
 * Auth is still enforced. ProtectedRoute is kept here, and /editor is added to
 * the middleware's protected prefixes alongside /dashboard.
 */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="dark h-screen w-screen overflow-hidden bg-background text-foreground">
        {children}
      </div>
    </ProtectedRoute>
  );
}
