import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardNav from "@/components/dashboard/DashboardNav";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div style={{
        display: "flex",
        minHeight: "100vh",
        background: "#F8F6F2",
        fontFamily: "'Outfit', sans-serif"
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Outfit:wght@300;400;500;600&display=swap');
        `}</style>

        {/* Sidebar */}
        <DashboardSidebar />

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Top Navigation */}
          <DashboardNav />

          {/* Page Content */}
          <main style={{
            flex: 1,
            padding: "32px",
            overflowY: "auto"
          }}>
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
