import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: account } = await supabase
      .from('token_accounts')
      .select('balance_tokens')
      .eq('user_id', user.id)
      .single()

    const { data: transactions } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      balance: account?.balance_tokens ?? 0,
      transactions: transactions || [],
    })
  } catch (error: unknown) {
    console.error('Balance error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
