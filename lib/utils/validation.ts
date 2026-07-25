// Validation utilities for forms

export function validatePhone(phone: string): boolean {
  if (!phone || phone.trim() === '') return true // Optional field

  // Support US and international formats
  // Examples: (123) 456-7890, 123-456-7890, +1 123 456 7890, +44 20 1234 5678
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/
  return phoneRegex.test(phone.replace(/\s/g, ''))
}

export function validateUrl(url: string): boolean {
  if (!url || url.trim() === '') return true // Optional field

  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function formatPhone(phone: string): string {
  if (!phone) return ''

  // Remove non-numeric characters
  const cleaned = phone.replace(/\D/g, '')

  // Format as (XXX) XXX-XXXX for 10-digit US numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }

  // Format as +X (XXX) XXX-XXXX for 11-digit numbers (with country code)
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }

  // Return as-is for international or other formats
  return phone
}

export function validateEmail(email: string): boolean {
  if (!email || email.trim() === '') return false

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}
