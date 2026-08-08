import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDownloadPresignedUrl, getPublicUrl } from '@/lib/aws/s3'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { key, projectId, fileName, fileSize } = await request.json()

    if (!key || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const viewUrl = await getDownloadPresignedUrl(key, 86400) // 24h

    const { data: photo, error } = await supabase
      .from('photos')
      .insert({
        project_id: projectId,
        s3_key: key,
        s3_url: viewUrl,
        file_name: fileName || key.split('/').pop() || 'unknown',
        file_size: fileSize || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving photo:', error)
      return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 })
    }

    return NextResponse.json({ success: true, url: viewUrl, key, photo })
  } catch (error: unknown) {
    console.error('Upload complete error:', error)
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 })
  }
}
