import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const title = (body.title || '').trim()
    if (!title) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }
    const aspectRatio = body.aspectRatio === '16:9' ? '16:9' : '9:16'

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, title, aspect_ratio: aspectRatio })
      .select()
      .single()

    if (error) {
      console.error('Error creating project:', error)
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    }

    return NextResponse.json(project)
  } catch (error: unknown) {
    console.error('Project creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return NextResponse.json(projects || [])
  } catch (error: unknown) {
    console.error('Projects list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
