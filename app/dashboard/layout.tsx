import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardNav from "@/components/dashboard/DashboardNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div style={{
        minHeight: "100vh",
        background: "#F8F6F2",
        fontFamily: "'Outfit', sans-serif"
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Outfit:wght@300;400;500;600&display=swap');
        `}</style>

        <DashboardNav />

        <main style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "32px 24px",
        }}>
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
