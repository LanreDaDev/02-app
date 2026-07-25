import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/aws/s3'

export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { key, orderId, type } = body

    if (!key || !orderId || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get public URL
    const publicUrl = getPublicUrl(key)

    return NextResponse.json({
      success: true,
      url: publicUrl,
      key,
      message: 'Upload completed successfully',
    })
  } catch (error: any) {
    console.error('Error completing upload:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete upload' },
      { status: 500 }
    )
  }
}
