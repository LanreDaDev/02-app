"use client";

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect /sign-in to /login for consistency
export default function SignInRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/login')
  }, [router])

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
        fontSize: '12px',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#9C9088'
      }}>
        Redirecting...
      </div>
    </div>
  )
}
