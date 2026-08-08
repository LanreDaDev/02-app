import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUploadPresignedUrl, generateS3Key } from '@/lib/aws/s3'

// 25MB clears a full-quality 45MP JPEG export, which is above anything a listing
// photographer will hand over. Larger buys nothing: the reframe model downsamples
// and everything is delivered at 1080p.
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_BYTES || '26214400', 10)
const MAX_PHOTOS_PER_PROJECT = parseInt(process.env.MAX_IMAGES_PER_PROJECT || '50', 10)

// HEIC is deliberately absent: browsers can't render it in <img> and Pillow needs
// pillow-heif to open it. Add both together or not at all.
const ALLOWED_TYPES = (
  process.env.ALLOWED_UPLOAD_TYPES || 'image/jpeg,image/png,image/webp'
)
  .split(',')
  .map((t) => t.trim())
  .concat('image/jpg') // normalized to image/jpeg below

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, fileName, contentType } = await request.json()

    if (!projectId || !fileName || !contentType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { count } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)

    if ((count ?? 0) >= MAX_PHOTOS_PER_PROJECT) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PHOTOS_PER_PROJECT} photos per project` },
        { status: 400 }
      )
    }

    const key = generateS3Key(user.id, projectId, fileName, 'photo')
    const normalizedType = contentType === 'image/jpg' ? 'image/jpeg' : contentType
    const uploadUrl = await getUploadPresignedUrl(key, normalizedType)

    return NextResponse.json({ uploadUrl, key, contentType: normalizedType, maxFileSize: MAX_FILE_SIZE })
  } catch (error: unknown) {
    console.error('Presign error:', error)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }
}
