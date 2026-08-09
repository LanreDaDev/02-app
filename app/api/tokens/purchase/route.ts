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

    // Kill switch. Set NEXT_PUBLIC_PURCHASES_ENABLED=false to close the shop —
    // used while Stripe is still on test keys, since the test card is public and
    // would otherwise let anyone mint tokens. Enforced here, not just hidden in
    // the UI, because hiding a button is not a control.
    if (process.env.NEXT_PUBLIC_PURCHASES_ENABLED === 'false') {
      return NextResponse.json(
        { error: 'purchases_disabled', message: 'Token purchases are temporarily unavailable.' },
        { status: 503 }
      )
    }

    const { priceId } = await request.json()

    if (!priceId) {
      return NextResponse.json({ error: 'priceId required' }, { status: 400 })
    }

    const stripe = await import('stripe').then(
      (m) => new m.default(process.env.STRIPE_SECRET_KEY!)
    )

    // The app is served from a single origin, so this is unambiguous.
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      metadata: { user_id: user.id, price_id: priceId },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/tokens?success=true`,
      cancel_url: `${origin}/dashboard/tokens?canceled=true`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    console.error('Purchase error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
