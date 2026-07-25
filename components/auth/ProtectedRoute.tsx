"use client";

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, profile, loading, isAdmin } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not authenticated, redirect to login
        router.push('/login')
      } else if (requireAdmin && !isAdmin) {
        // Not an admin, redirect to dashboard
        router.push('/dashboard')
      } else if (user && profile) {
        // Check if onboarding needs to be completed
        const isOnboardingRoute = window.location.pathname.startsWith('/onboarding')

        if (!profile.onboarding_completed &&
            !profile.onboarding_skipped &&
            !isOnboardingRoute) {
          // Redirect to onboarding if not completed and not skipped
          router.push('/onboarding')
        }
      }
    }
  }, [user, profile, loading, isAdmin, requireAdmin, router])

  // Show loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#F8F6F2',
        fontFamily: "'Outfit', sans-serif"
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #E8E0D4',
            borderTop: '3px solid #9C8E82',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{
            fontSize: '12px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#9C9088'
          }}>
            Loading...
          </span>
        </div>
      </div>
    )
  }

  // Show nothing if not authenticated (will redirect)
  if (!user || (requireAdmin && !isAdmin)) {
    return null
  }

  // Show children if authenticated
  return <>{children}</>
}
