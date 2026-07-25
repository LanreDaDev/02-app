"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      setError(error.message || 'An error occurred during sign in');
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      router.push('/dashboard');
    } catch (error: any) {
      setError(error.message || 'An error occurred during sign in');
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#F8F6F2", color: "#141414", minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Outfit:wght@300;400;500;600&display=swap');
      `}</style>

      <Navigation />

      <main style={{
        maxWidth: "520px",
        margin: "0 auto",
        padding: "160px 32px 100px"
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            background: "white",
            padding: "56px 48px",
            boxShadow: "0 2px 32px rgba(0,0,0,0.08)"
          }}
        >
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(36px, 5vw, 48px)",
            fontWeight: 400,
            lineHeight: 1.1,
            color: "#141414",
            marginBottom: "16px",
            textAlign: "center"
          }}>
            Welcome back
          </h1>

          <p style={{
            fontSize: "15px",
            color: "#5A5248",
            textAlign: "center",
            marginBottom: "40px",
            lineHeight: 1.7
          }}>
            Sign in to access your dashboard, orders, and video library.
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: "#FEE",
                border: "1px solid #FCC",
                color: "#C33",
                padding: "14px 18px",
                marginBottom: "28px",
                fontSize: "13px",
                borderRadius: "2px",
                lineHeight: 1.5
              }}
            >
              {error}
            </motion.div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
              padding: "18px 28px",
              background: "white",
              border: "2px solid #C8C0B4",
              fontSize: "15px",
              fontWeight: 500,
              color: "#141414",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: loading ? 0.6 : 1,
              fontFamily: "'Outfit', sans-serif"
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = "#141414";
                e.currentTarget.style.background = "#F8F6F2";
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#C8C0B4";
              e.currentTarget.style.background = "white";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4"/>
              <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
              <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
              <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
            </svg>
            {loading ? "Signing in..." : "Continue with Google"}
          </button>

          {/* Divider */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            margin: "24px 0"
          }}>
            <div style={{ flex: 1, height: "1px", background: "#E8E0D4" }} />
            <span style={{ fontSize: "12px", color: "#9C9088", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Or with email
            </span>
            <div style={{ flex: 1, height: "1px", background: "#E8E0D4" }} />
          </div>

          {/* Email Form */}
          <form onSubmit={handleEmailSignIn} style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "32px" }}>
            <div>
              <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "8px" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1px solid #C8C0B4",
                  fontSize: "14px",
                  fontFamily: "'Outfit', sans-serif",
                  transition: "border-color 0.2s",
                  outline: "none"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "#9C8E82"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#C8C0B4"}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "8px" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1px solid #C8C0B4",
                  fontSize: "14px",
                  fontFamily: "'Outfit', sans-serif",
                  transition: "border-color 0.2s",
                  outline: "none"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "#9C8E82"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#C8C0B4"}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "16px 24px",
                background: "#141414",
                color: "#F8F6F2",
                border: "none",
                fontSize: "13px",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                opacity: loading ? 0.6 : 1,
                fontFamily: "'Outfit', sans-serif",
                marginTop: "8px"
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.background = "#2A2A2A";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#141414";
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Don't have account */}
          <div style={{
            textAlign: "center",
            paddingTop: "28px",
            marginTop: "28px",
            borderTop: "1px solid #E8E0D4"
          }}>
            <p style={{ fontSize: "13px", color: "#5A5248", lineHeight: 1.6 }}>
              Don&apos;t have an account?{" "}
              <button
                onClick={() => router.push('/signup')}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9C8E82",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  padding: 0
                }}
              >
                Sign up
              </button>
            </p>
          </div>

          <p style={{
            fontSize: "11px",
            color: "#9C9088",
            textAlign: "center",
            marginTop: "28px",
            lineHeight: 1.7
          }}>
            By signing in, you agree to our{" "}
            <a href="/terms" style={{ color: "#6B5E4E", textDecoration: "underline" }}>
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" style={{ color: "#6B5E4E", textDecoration: "underline" }}>
              Privacy Policy
            </a>.
          </p>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
