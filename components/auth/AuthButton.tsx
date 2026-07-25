"use client";

import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from 'next/navigation'
import UserMenu from './UserMenu'

export default function AuthButton() {
  const { user } = useAuth()
  const router = useRouter()

  // If user is logged in, show avatar menu with logout
  if (user) {
    return <UserMenu />
  }

  // If no user, show Get Started button
  return (
    <button
      onClick={() => router.push('/signup')}
      style={{
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        background: '#141414',
        color: '#F8F6F2',
        padding: '11px 24px',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontFamily: "'Outfit', sans-serif"
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = '#2A2A2A'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = '#141414'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      Get started
    </button>
  )
}
