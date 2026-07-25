import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, brokerage, sourceType, mlsLink, music, voiceover, selectedPackage, notes } = body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (sourceType === "mls" && !mlsLink) {
      return NextResponse.json({ error: "MLS link is required." }, { status: 400 });
    }

    const packageLabels: Record<string, string> = {
      single: "Single Video — $225",
      fivepack: "5-Pack — $1,050",
      more: "Volume — Contact",
    };
    const voiceoverLabels: Record<string, string> = {
      none: "No voiceover (music only)",
      ai: "AI luxury voiceover",
      own: "I'll provide my own voice",
    };

    // ── Notification to Lanre ─────────────────────────────────────────────────
    await resend.emails.send({
      from: "Olade Orders <orders@notifications.olade.com>",
      to: "lanre@olade.com",
      subject: `New order from ${name}${brokerage ? ` · ${brokerage}` : ""}`,
      html: `
        <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 40px 32px; background: #F8F6F2; color: #141414;">
          <div style="margin-bottom: 32px;">
            <span style="font-family: sans-serif; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #9C9088;">New Olade Order</span>
            <h1 style="font-size: 28px; font-weight: 400; margin: 8px 0 0; line-height: 1.2;">${name}</h1>
            ${brokerage ? `<p style="font-family: sans-serif; font-size: 13px; color: #7A736A; margin: 4px 0 0;">${brokerage}</p>` : ""}
          </div>

          <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
            <tr style="border-bottom: 1px solid #E8E0D4;">
              <td style="padding: 12px 0; color: #9C9088; width: 140px;">Email</td>
              <td style="padding: 12px 0;"><a href="mailto:${email}" style="color: #141414;">${email}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E0D4;">
              <td style="padding: 12px 0; color: #9C9088;">Package</td>
              <td style="padding: 12px 0; font-weight: 500;">${packageLabels[selectedPackage] || selectedPackage}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E0D4;">
              <td style="padding: 12px 0; color: #9C9088;">Photos</td>
              <td style="padding: 12px 0;">
                ${sourceType === "mls"
                  ? `MLS link: <a href="${mlsLink}" style="color: #6B5E4E;">${mlsLink}</a>`
                  : "Will upload photos — send upload link"}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E0D4;">
              <td style="padding: 12px 0; color: #9C9088;">Music mood</td>
              <td style="padding: 12px 0;">${music || "No preference"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E0D4;">
              <td style="padding: 12px 0; color: #9C9088;">Voiceover</td>
              <td style="padding: 12px 0;">${voiceoverLabels[voiceover] || voiceover}</td>
            </tr>
            ${notes ? `
            <tr>
              <td style="padding: 12px 0; color: #9C9088; vertical-align: top;">Notes</td>
              <td style="padding: 12px 0; line-height: 1.6;">${notes}</td>
            </tr>` : ""}
          </table>

          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #E8E0D4;">
            <a href="mailto:${email}?subject=Your%20Olade%20video%20order&body=Hi%20${encodeURIComponent(name)}%2C%0A%0AThanks%20for%20your%20order."
              style="display: inline-block; background: #141414; color: #F8F6F2; font-family: sans-serif; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; padding: 14px 28px; text-decoration: none;">
              Reply to ${name}
            </a>
          </div>
        </div>
      `,
    });

    // ── Confirmation to customer ──────────────────────────────────────────────
    await resend.emails.send({
      from: "Olade <orders@notifications.olade.com>",
      to: email,
      subject: "We've got your brief — you'll hear from us shortly",
      html: `
        <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 40px 32px; background: #F8F6F2; color: #141414;">

          <div style="margin-bottom: 40px;">
            <span style="font-family: sans-serif; font-size: 22px; font-weight: 600; color: #141414; letter-spacing: -0.5px;">ol<span style="color: #9C8E82;">a</span>de</span>
          </div>

          <h1 style="font-size: 32px; font-weight: 400; line-height: 1.2; margin: 0 0 20px;">Hi ${name},</h1>

          <p style="font-family: sans-serif; font-size: 16px; line-height: 1.75; color: #3A3530; margin: 0 0 20px;">
            We&apos;ve received your brief and someone from the Olade team will be in touch within the next couple of hours with everything you need to get started.
          </p>

          <p style="font-family: sans-serif; font-size: 16px; line-height: 1.75; color: #3A3530; margin: 0 0 32px;">
            We&apos;ll send you a secure payment link and — if you selected photo upload — a link to send us your images. From there, we handle everything. Your finished video will be delivered within 24 hours of us receiving your photos.
          </p>

          <div style="background: white; border: 1px solid #E8E0D4; padding: 28px 32px; margin-bottom: 32px;">
            <p style="font-family: sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #9C9088; margin: 0 0 16px;">Your brief</p>
            <table style="width: 100%; font-family: sans-serif; font-size: 14px; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #F0EBE3;">
                <td style="padding: 10px 0; color: #9C9088; width: 130px;">Package</td>
                <td style="padding: 10px 0; color: #141414; font-weight: 500;">${packageLabels[selectedPackage] || selectedPackage}</td>
              </tr>
              <tr style="border-bottom: 1px solid #F0EBE3;">
                <td style="padding: 10px 0; color: #9C9088;">Photos</td>
                <td style="padding: 10px 0; color: #141414;">
                  ${sourceType === "mls" ? "MLS link provided" : "You&apos;ll upload photos — we&apos;ll send the link"}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #F0EBE3;">
                <td style="padding: 10px 0; color: #9C9088;">Music mood</td>
                <td style="padding: 10px 0; color: #141414;">${music || "No preference"}</td>
              </tr>
              <tr ${notes ? 'style="border-bottom: 1px solid #F0EBE3;"' : ''}>
                <td style="padding: 10px 0; color: #9C9088;">Voiceover</td>
                <td style="padding: 10px 0; color: #141414;">${voiceoverLabels[voiceover] || voiceover}</td>
              </tr>
              ${notes ? `
              <tr>
                <td style="padding: 10px 0; color: #9C9088; vertical-align: top;">Notes</td>
                <td style="padding: 10px 0; color: #141414; line-height: 1.6;">${notes}</td>
              </tr>` : ""}
            </table>
          </div>

          <p style="font-family: sans-serif; font-size: 15px; line-height: 1.75; color: #3A3530; margin: 0 0 8px;">
            If you have any questions in the meantime, reply to this email or reach us at
            <a href="mailto:lanre@olade.com" style="color: #6B5E4E;">lanre@olade.com</a>.
          </p>

          <p style="font-family: sans-serif; font-size: 15px; line-height: 1.75; color: #3A3530; margin: 0 0 40px;">
            Talk soon.
          </p>

          <div style="border-top: 1px solid #E8E0D4; padding-top: 24px;">
            <span style="font-family: sans-serif; font-size: 18px; font-weight: 600; color: #141414; letter-spacing: -0.5px;">ol<span style="color: #9C8E82;">a</span>de</span>
            <p style="font-family: sans-serif; font-size: 12px; color: #9C9088; margin: 8px 0 0;">
              <a href="https://olade.com" style="color: #9C9088; text-decoration: none;">olade.com</a>
              &nbsp;·&nbsp;
              <a href="https://olade.com/terms" style="color: #9C9088; text-decoration: none;">Terms</a>
              &nbsp;·&nbsp;
              <a href="https://olade.com/privacy" style="color: #9C9088; text-decoration: none;">Privacy</a>
            </p>
          </div>

        </div>
      `,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Order submission error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again or email lanre@olade.com." }, { status: 500 });
  }
}