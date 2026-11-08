import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().min(1, 'Please enter your name').max(100),
  email: z.string().email('Please enter a valid email address').max(200),
  phone: z.string().max(30).optional().default(''),
  subject: z.string().max(100).optional().default('General enquiry'),
  message: z.string().min(5, 'Please enter a message (at least 5 characters)').max(2000),
});

/**
 * Public contact-form endpoint.
 *
 * Sends an enquiry email to the store's contact address (BRAND.email unless
 * CONTACT_TO is set). Uses the same email transport as order notifications —
 * Resend when configured, otherwise logs to the server console so messages
 * aren't lost during setup.
 *
 * This is a public endpoint (no login required) so customers can reach the
 * store from the Contact page. We keep validation strict to deter spam and
 * do not send any confirmation email to the enquirer — just the inbound
 * message to the store.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: e?.issues?.[0]?.message || 'Invalid form data' }, { status: 400 });
  }

  const { name, email, phone, subject, message } = parsed;
  const to = process.env.CONTACT_TO || BRAND.email;

  const text = [
    `New contact-form enquiry from ${name}`,
    `Subject: ${subject}`,
    `Email:   ${email}`,
    phone ? `Phone:   ${phone}` : null,
    '',
    message,
    '',
    '— Sent from the Dr Cloud contact page.',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
      <h1 style="margin:0 0 4px;font-size:20px;color:#111827;">New contact enquiry</h1>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Subject: <b style="color:#111827;">${escapeHtml(subject)}</b></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:90px;">Name</td><td style="padding:6px 0;color:#111827;font-weight:600;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;"><a href="mailto:${encodeURIComponent(email)}" style="color:#2563eb;">${escapeHtml(email)}</a></td></tr>
        ${phone ? `<tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;"><a href="tel:${encodeURIComponent(phone)}" style="color:#2563eb;">${escapeHtml(phone)}</a></td></tr>` : ''}
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:14px;color:#111827;white-space:pre-wrap;">${escapeHtml(message)}</div>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Reply directly to ${escapeHtml(email)} to respond.</p>
    </div>`;

  try {
    await sendEmail({
      to: { email: to },
      replyTo: email,
      subject: `[Dr Cloud] ${subject} — from ${name}`,
      text,
      html,
    });
  } catch (e: any) {
    // Fall through: sendEmail already logs console fallback; treat as success
    // from the customer's perspective (the server logs contain the message).
    console.warn('[contact] sendEmail failed (will be in console fallback):', e?.message);
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
