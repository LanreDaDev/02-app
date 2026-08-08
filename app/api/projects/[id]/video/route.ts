import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { muxHlsUrl, muxMp4Url } from '@/lib/mux'

/**
 * The finalized video, in both forms.
 *
 * Mux serves the in-app stream; S3 holds the download file. Remotion Lambda
 * writes the MP4 to a public S3 URL, so the download link is that URL directly
 * rather than a presigned one.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: video } = await supabase
    .from('videos')
    .select('id, status, s3_key, mux_playback_id, duration_sec, error_message')
    .eq('project_id', projectId)
    .maybeSingle()

  if (!video) {
    return NextResponse.json({ status: 'none', downloadUrl: null, streamUrl: null })
  }

  return NextResponse.json({
    videoId: video.id,
    status: video.status,
    durationSec: video.duration_sec,
    error: video.error_message,
    // Download: the rendered file itself.
    downloadUrl: video.s3_key ? publicS3Url(video.s3_key) : null,
    // Watch in-app: the streamable copy of the same render.
    streamUrl: video.mux_playback_id ? muxHlsUrl(video.mux_playback_id) : null,
    mp4Url: video.mux_playback_id ? muxMp4Url(video.mux_playback_id) : null,
  })
}

function publicS3Url(key: string): string {
  // Remotion Lambda returns a fully-qualified URL for public renders.
  if (key.startsWith('http')) return key

  const bucket = process.env.REMOTION_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME
  const region = process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}
