import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUploadPresignedUrl, generateS3Key } from '@/lib/aws/s3'

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
    const { fileName, contentType, orderId, type } = body

    if (!fileName || !contentType || !orderId || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = {
      photo: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      video: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    }

    if (!allowedTypes[type as keyof typeof allowedTypes]?.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      )
    }

    // Generate S3 key
    const key = generateS3Key(user.id, orderId, fileName, type)

    // Generate presigned URL
    const uploadUrl = await getUploadPresignedUrl(key, contentType)

    return NextResponse.json({
      uploadUrl,
      key,
      message: 'Presigned URL generated successfully',
    })
  } catch (error: any) {
    console.error('Error generating presigned URL:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate presigned URL' },
      { status: 500 }
    )
  }
}
