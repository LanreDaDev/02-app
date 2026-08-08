import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { selectedPhotoIds } = await request.json()

    if (!selectedPhotoIds || !Array.isArray(selectedPhotoIds) || selectedPhotoIds.length < 2) {
      return NextResponse.json({ error: 'At least 2 photos must be selected' }, { status: 400 })
    }

    const { error: resetError } = await supabase
      .from('photos')
      .update({ selected: false, order_index: null })
      .eq('project_id', projectId)

    if (resetError) {
      return NextResponse.json({ error: 'Failed to reset selections' }, { status: 500 })
    }

    // Update each photo with its position in the user-chosen sequence
    for (let i = 0; i < selectedPhotoIds.length; i++) {
      const { error } = await supabase
        .from('photos')
        .update({ selected: true, order_index: i })
        .eq('id', selectedPhotoIds[i])
        .eq('project_id', projectId)

      if (error) {
        return NextResponse.json({ error: 'Failed to confirm photos' }, { status: 500 })
      }
    }

    await supabase
      .from('projects')
      .update({ status: 'confirmed' })
      .eq('id', projectId)

    return NextResponse.json({ success: true, selectedCount: selectedPhotoIds.length })
  } catch (error: unknown) {
    console.error('Confirm error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
