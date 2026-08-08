import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { creditTokens } from '@/lib/tokens'

const TOKEN_PACKS: Record<string, number> = {
  [process.env.STRIPE_PRICE_STARTER || 'price_starter']: 800,
  [process.env.STRIPE_PRICE_STANDARD || 'price_standard']: 8000,
}

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const stripe = await import('stripe').then(
      (m) => new m.default(process.env.STRIPE_SECRET_KEY!)
    )

    let event
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      )
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any
      const userId = session.metadata?.user_id
      const priceId = session.metadata?.price_id

      if (!userId || !priceId) {
        console.error('Missing metadata on Stripe session:', session.id)
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
      }

      const tokenAmount = TOKEN_PACKS[priceId]
      if (!tokenAmount) {
        console.error('Unknown price ID:', priceId)
        return NextResponse.json({ error: 'Unknown price' }, { status: 400 })
      }

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Ledger insert and balance update happen in one transaction, keyed on the
      // Stripe event ID — Stripe retries webhooks, and a read-then-write here
      // would drop a concurrent purchase's tokens.
      const credit = await creditTokens(userId, tokenAmount, 'purchase', event.id)

      if (credit.status === 'replay') {
        return NextResponse.json({ received: true })
      }

      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'purchase_confirmed',
        title: 'Tokens Added',
        message: `${tokenAmount.toLocaleString()} tokens have been added to your account.`,
      })
    }

    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    console.error('Stripe webhook error:', error)
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 })
  }
}
