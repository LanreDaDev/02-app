"use client";

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { LogOut, User, Settings, CreditCard, Film, FolderPlus } from 'lucide-react'

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, profile, signOut } = useAuth()
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  if (!user) return null

  const initials = profile?.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || user.email?.[0].toUpperCase() || 'U'

  return (
    <div ref={menuRef} style={{ position: 'relative', fontFamily: "'Outfit', sans-serif" }}>
      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: '#9C8E82',
          border: '2px solid #E8E0D4',
          color: '#F8F6F2',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = '#8A7E72'
          e.currentTarget.style.borderColor = '#C8C0B4'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = '#9C8E82'
          e.currentTarget.style.borderColor = '#E8E0D4'
        }}
      >
        {initials}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '50px',
            right: 0,
            width: '240px',
            background: 'white',
            border: '1px solid #E8E0D4',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            zIndex: 1000
          }}
        >
          {/* User Info */}
          <div style={{ padding: '16px', borderBottom: '1px solid #E8E0D4' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#141414', marginBottom: '4px' }}>
              {profile?.name || user.email || 'User'}
            </div>
            <div style={{ fontSize: '12px', color: '#9C9088' }}>{user.email}</div>
            {profile?.role === 'admin' && (
              <div style={{
                display: 'inline-block',
                marginTop: '8px',
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: '#141414',
                color: '#F8F6F2',
                padding: '3px 8px'
              }}>
                Admin
              </div>
            )}
          </div>

          {/* Menu Items */}
          <div style={{ padding: '8px 0' }}>
            <button
              onClick={() => {
                router.push('/dashboard/projects/new')
                setIsOpen(false)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                color: '#141414',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#F8F6F2'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <FolderPlus size={16} />
              New Project
            </button>

            <button
              onClick={() => {
                router.push('/dashboard/projects')
                setIsOpen(false)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                color: '#141414',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#F8F6F2'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Film size={16} />
              Projects
            </button>

            <button
              onClick={() => {
                router.push('/dashboard/tokens')
                setIsOpen(false)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                color: '#141414',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#F8F6F2'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <CreditCard size={16} />
              Tokens
            </button>

            <button
              onClick={() => {
                router.push('/dashboard/settings')
                setIsOpen(false)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                color: '#141414',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#F8F6F2'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Settings size={16} />
              Settings
            </button>
          </div>

          {/* Sign Out */}
          <div style={{ borderTop: '1px solid #E8E0D4', padding: '8px 0' }}>
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                color: '#C33',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#FEE'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
