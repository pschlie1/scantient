import { NextResponse } from "next/server";
import { z } from "zod";

const subscribeSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email } = parsed.data;

  const resendKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const fromEmail = process.env.ALERT_FROM_EMAIL ?? "noreply@vibesafe.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? "https://vibesafe-two.vercel.app";

  // Add to Resend audience (gracefully degrade if not configured)
  if (!audienceId) {
    console.log("[newsletter] RESEND_AUDIENCE_ID not set — skipping audience add for:", email);
  } else if (resendKey) {
    try {
      await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
    } catch (err) {
      console.warn("[newsletter] Failed to add contact to audience:", err);
    }
  }

  // Send welcome email (fire-and-forget)
  if (resendKey) {
    const welcomeHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <div style="margin-bottom: 24px;">
          <div style="width: 40px; height: 40px; background: #000; border-radius: 10px; margin-bottom: 16px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: #fff; font-weight: bold; font-size: 18px; line-height: 1;">V</span>
          </div>
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 8px 0;">Thanks for subscribing to VibeSafe 🙌</h1>
          <p style="color: #555; font-size: 15px; margin: 0; line-height: 1.6;">
            We'll keep you posted on security insights, compliance guides, and practical advice for IT leaders managing AI-generated applications.
          </p>
        </div>
        <a
          href="${appUrl}/blog"
          style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;"
        >
          Read the blog →
        </a>
        <p style="margin-top: 28px; font-size: 12px; color: #aaa;">
          You subscribed at <a href="${appUrl}" style="color: #888;">vibesafe.app</a>.
          If this was a mistake, you can ignore this email.
        </p>
      </div>
    `;

    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Thanks for subscribing to VibeSafe — we'll keep you posted on security insights",
        html: welcomeHtml,
      }),
    }).catch((err) => console.warn("[newsletter] Failed to send welcome email:", err));
  }

  return NextResponse.json({ ok: true });
}
