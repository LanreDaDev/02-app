import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { confirmation } = await request.json()

    if (confirmation !== 'DELETE') {
      return NextResponse.json(
        { error: 'Type DELETE to confirm account deletion' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await adminSupabase.auth.admin.deleteUser(user.id)

    if (error) {
      console.error('Account deletion error:', error)
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }

    await supabase.auth.signOut()

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Account deletion error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
