/**
 * Transactional email sending.
 *
 * Addresses / credentials come from environment variables (you wire them later):
 *   RESEND_API_KEY        — Resend API key. If unset, emails are logged to server
 *                           console instead of being sent (safe for dev/test).
 *   EMAIL_FROM            — "From" address, e.g. "Dr Cloud <orders@drcloud.co.uk>".
 *                           Must be a verified domain/sender in Resend.
 *   EMAIL_ADMIN_ALERTS_TO — Comma-separated list of addresses to BCC/alert when
 *                           a new order comes in (shop owner, staff).
 *   STORE_NAME            — Brand name for email footers (defaults to BRAND.fullName).
 *   STORE_PHONE           — Contact phone for email footers.
 *   STORE_ADDRESS         — Single-line address for email footers.
 *   STORE_URL             — Public site base URL (defaults to https://vapeshop202626.vercel.app).
 *
 * Wire up later:
 *   1. Sign up at resend.com, add API key as RESEND_API_KEY in Vercel.
 *   2. Verify your sending domain in Resend, set EMAIL_FROM to an address on it.
 *   3. Set EMAIL_ADMIN_ALERTS_TO to your personal/shop email.
 */
import { BRAND, fullAddress, BRAND as _b } from '@/lib/brand';

export type Address = { email: string; name?: string };

export type SendArgs = {
  to: Address | Address[];
  from?: Address;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type EmailResult = { ok: boolean; provider: 'resend' | 'console'; id?: string; error?: string };

function getFrom(): Address {
  const raw = process.env.EMAIL_FROM;
  if (raw) {
    // Accept formats: "Dr Cloud <orders@x.y>" or just "orders@x.y"
    const m = raw.match(/^(.+?)\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim(), email: m[2].trim() };
    return { email: raw.trim() };
  }
  return { name: `${BRAND.fullName} (test mode)`, email: 'onboarding@resend.dev' };
}

function storeUrl(): string {
  return process.env.STORE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vapeshop202626.vercel.app');
}

export function adminRecipients(): Address[] {
  const raw = (process.env.EMAIL_ADMIN_ALERTS_TO || '').trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((email) => ({ email }));
}

export async function sendEmail(args: SendArgs): Promise<EmailResult> {
  const from = args.from || getFrom();
  const toArr = Array.isArray(args.to) ? args.to : [args.to];
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev/test fallback — log to server console, don't actually send.
    console.log('\n===== EMAIL (dev fallback — no RESEND_API_KEY set) =====');
    console.log('From:', from);
    console.log('To:  ', toArr);
    console.log('Subj:', args.subject);
    console.log('---- text ----');
    console.log(args.text || '(no plaintext)');
    console.log('===== END EMAIL =====\n');
    return { ok: true, provider: 'console' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from.name ? `${from.name} <${from.email}>` : from.email,
        to: toArr.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)),
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] Resend error:', res.status, data);
      return { ok: false, provider: 'resend', error: JSON.stringify(data) };
    }
    return { ok: true, provider: 'resend', id: data.id };
  } catch (e: any) {
    console.error('[email] Failed:', e);
    return { ok: false, provider: 'resend', error: e?.message || String(e) };
  }
}

/* ---------- HTML / text helpers ---------- */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(bodyInner: string, opts: { preview?: string } = {}): { html: string; text: string } {
  const name = process.env.STORE_NAME || BRAND.fullName;
  const phone = process.env.STORE_PHONE || BRAND.phone;
  const addr = process.env.STORE_ADDRESS || fullAddress;
  const url = storeUrl();
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${opts.preview ? `<meta name="description" content="${escapeHtml(opts.preview)}" />` : ''}<style>
    body{margin:0;padding:0;background:#0b0b0d;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
    .wrap{max-width:600px;margin:0 auto;}
    .header{background:#000;padding:24px;text-align:center;border-bottom:1px solid #1f1f22;}
    .header h1{margin:0;color:#14b8a6;font-size:22px;letter-spacing:.5px;}
    .header p{margin:4px 0 0;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:2px;}
    .content{background:#121214;padding:28px 24px;}
    .content h2{color:#fff;margin:0 0 12px;font-size:20px;}
    .content p{margin:8px 0;line-height:1.5;font-size:14px;color:#d4d4d8;}
    .banner{background:#14b8a6;color:#000;font-weight:800;text-align:center;padding:10px;border-radius:10px;margin:16px 0;font-size:14px;letter-spacing:.5px;}
    table.items{width:100%;border-collapse:collapse;margin:18px 0;}
    table.items th,table.items td{padding:10px 8px;text-align:left;border-bottom:1px solid #222;font-size:14px;}
    table.items th{color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;}
    table.items td.num{text-align:right;font-variant-numeric:tabular-nums;}
    .totals{margin-left:auto;width:260px;border-collapse:collapse;}
    .totals td{padding:6px 0;font-size:14px;}
    .totals td.num{text-align:right;font-variant-numeric:tabular-nums;}
    .totals tr.grand td{border-top:2px solid #14b8a6;padding-top:10px;font-weight:800;color:#fff;font-size:16px;}
    .addr{background:#0b0b0d;border:1px solid #1f1f22;border-radius:10px;padding:14px 16px;margin:14px 0;font-size:13px;color:#cbd5e1;}
    .addr b{color:#fff;display:block;margin-bottom:4px;text-transform:uppercase;font-size:11px;letter-spacing:1px;color:#9ca3af;}
    .btn{display:inline-block;background:#fbbf24;color:#000;font-weight:800;text-decoration:none;padding:12px 20px;border-radius:10px;margin:18px 0;}
    .footer{background:#000;padding:20px 24px;color:#6b7280;font-size:11px;text-align:center;border-top:1px solid #1f1f22;}
    .footer a{color:#14b8a6;}
    .warn{background:#422006;border:1px solid #f59e0b;color:#fcd34d;padding:10px 14px;border-radius:8px;font-size:12px;margin:14px 0;}
  </style></head><body><div class="wrap">
    <div class="header"><h1>${escapeHtml(name)}</h1><p>${escapeHtml(BRAND.tagline)}</p></div>
    <div class="content">${bodyInner}</div>
    <div class="footer">
      <div>© ${new Date().getFullYear()} ${escapeHtml(name)}. 18+ only. Nicotine is an addictive chemical.</div>
      <div style="margin-top:8px;">${escapeHtml(addr)} · Tel ${escapeHtml(phone)}</div>
      <div style="margin-top:8px;"><a href="${url}">${url.replace(/^https?:\/\//, '')}</a></div>
    </div>
  </div></body></html>`;
  // Plaintext is generated from stripped HTML (simple); callers can also supply `text`.
  const text = stripHtml(bodyInner).replace(/\n{3,}/g, '\n\n').trim();
  return { html, text };
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n');
}

function gbp(n: string | number | null | undefined): string {
  const v = Number(n ?? 0);
  return '£' + v.toFixed(2);
}

/* ---------- Order-shaped data (from DB) ---------- */

export type OrderEmailData = {
  id: number;
  number?: string; // optional human order number; falls back to #id
  subtotal: string | number;
  discount: string | number;
  shippingCost: string | number;
  totalAmount: string | number;
  collectionMode: 'delivery' | 'collect';
  shippingAddress: { name?: string; line1?: string; line2?: string; city?: string; county?: string; postcode?: string } | null;
  promoCode?: string | null;
  isGuest?: boolean; // guests track their order at /track (order number + email)
  customerEmail: string;
  customerName?: string | null;
  items: { productName: string; variantLabel: string; sku: string; quantity: number; unitPrice: string | number }[];
  createdAt: Date | string;
  paymentGateway?: string | null;
};

function fmtAddr(a: OrderEmailData['shippingAddress']): string {
  if (!a) return '';
  return [a.name, a.line1, a.line2, a.city, a.county, a.postcode].filter(Boolean).join(', ');
}

/* ---------- Public template builders ---------- */

export function buildCustomerConfirmation(o: OrderEmailData) {
  const isCollect = o.collectionMode === 'collect';
  const orderNo = o.number || `#${o.id}`;
  const itemsRows = o.items.map((i) =>
    `<tr><td><b>${escapeHtml(i.productName)}</b><br><span style="color:#9ca3af;font-size:12px;">${escapeHtml(i.variantLabel)} · ${escapeHtml(i.sku)}</span></td><td class="num" style="color:#9ca3af;">${i.quantity}×</td><td class="num">${gbp(i.unitPrice)}</td><td class="num">${gbp(Number(i.unitPrice) * i.quantity)}</td></tr>`
  ).join('');
  const inner = `
    <h2>Order confirmed — ${escapeHtml(orderNo)}</h2>
    <p>Hi${o.customerName ? ' ' + escapeHtml(o.customerName) : ''}, thanks for your order${isCollect ? ' for collection' : ''} from ${escapeHtml(BRAND.fullName)}. Payment has been received and we're ${isCollect ? 'preparing it' : 'packing it for dispatch'}.</p>
    ${isCollect ? `<div class="banner">CLICK & COLLECT — we'll email/text again when it's ready to pick up.</div>` : ``}
    <div class="addr">
      <b>${isCollect ? 'COLLECT FROM' : 'DELIVER TO'}</b>
      ${isCollect ? `${escapeHtml(fullAddress)}<br><span style="color:#9ca3af;">Bring ID (Challenge 25) and your order number.</span>` : escapeHtml(fmtAddr(o.shippingAddress))}
    </div>
    <table class="items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${gbp(o.subtotal)}</td></tr>
      ${Number(o.discount) > 0 ? `<tr><td>Discount${o.promoCode ? ` (${escapeHtml(o.promoCode)})` : ''}</td><td class="num">-${gbp(o.discount)}</td></tr>` : ''}
      <tr><td>${isCollect ? 'Collection' : 'Delivery'}</td><td class="num">${Number(o.shippingCost) === 0 ? 'FREE' : gbp(o.shippingCost)}</td></tr>
      <tr class="grand"><td>Total paid</td><td class="num">${gbp(o.totalAmount)}</td></tr>
    </table>
    <div style="clear:both;height:18px;"></div>
    <p style="text-align:center;"><a class="btn" href="${o.isGuest ? `${storeUrl()}/track` : `${storeUrl()}/order/${o.id}`}">${o.isGuest ? 'Track your order' : 'View your order'} →</a></p>
    <div class="warn">⚠️ You must be 18+ to purchase. Challenge 25 — ID may be required on ${isCollect ? 'collection' : 'delivery'}. Nicotine is highly addictive.</div>
    <p style="font-size:12px;color:#6b7280;">Questions? Reply to this email or call ${escapeHtml(BRAND.phone)}.</p>
  `;
  const { html, text } = layout(inner, { preview: `Order ${orderNo} confirmed — ${gbp(o.totalAmount)}${isCollect ? ' · ready soon for Click & Collect' : ''}` });
  return { subject: `${BRAND.fullName}: Order ${orderNo} confirmed`, html, text };
}

export function buildAdminNewOrderAlert(o: OrderEmailData) {
  const orderNo = o.number || `#${o.id}`;
  const isCollect = o.collectionMode === 'collect';
  const itemsRows = o.items.map((i) =>
    `<tr><td>${i.quantity}×</td><td><b>${escapeHtml(i.productName)}</b> <span style="color:#9ca3af;">${escapeHtml(i.variantLabel)}</span></td><td class="num">${gbp(Number(i.unitPrice) * i.quantity)}</td></tr>`
  ).join('');
  const inner = `
    <h2>🔔 New order — ${escapeHtml(orderNo)}</h2>
    <p>A new order has just been paid for.</p>
    <div class="addr">
      <b>CUSTOMER</b>
      ${escapeHtml(o.customerName || 'Guest')} &lt;${escapeHtml(o.customerEmail)}&gt;<br>
      <b style="margin-top:8px;">${isCollect ? 'COLLECTION' : 'DELIVERY ADDRESS'}</b>
      ${isCollect ? 'Click & Collect — customer will pick up from the shop.' : escapeHtml(fmtAddr(o.shippingAddress))}
    </div>
    <table class="items">
      <thead><tr><th style="width:40px;">Qty</th><th>Item</th><th class="num">Total</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${gbp(o.subtotal)}</td></tr>
      ${Number(o.discount) > 0 ? `<tr><td>Discount${o.promoCode ? ` (${escapeHtml(o.promoCode)})` : ''}</td><td class="num">-${gbp(o.discount)}</td></tr>` : ''}
      <tr><td>${isCollect ? 'Collection' : 'Delivery'}</td><td class="num">${Number(o.shippingCost) === 0 ? 'FREE' : gbp(o.shippingCost)}</td></tr>
      <tr class="grand"><td>Total</td><td class="num">${gbp(o.totalAmount)}</td></tr>
    </table>
    <div style="clear:both;height:18px;"></div>
    <p style="text-align:center;"><a class="btn" href="${storeUrl()}/admin/orders">Open admin orders →</a></p>
  `;
  const { html, text } = layout(inner, { preview: `NEW ORDER ${orderNo} — ${gbp(o.totalAmount)} (${isCollect ? 'collection' : 'delivery'})` });
  return {
    subject: `🔔 New order ${orderNo} — ${gbp(o.totalAmount)} ${isCollect ? '(Click & Collect)' : '(delivery)'}`,
    html,
    text,
  };
}

export function buildCollectionReady(o: OrderEmailData) {
  const orderNo = o.number || `#${o.id}`;
  const inner = `
    <h2>Ready to collect — ${escapeHtml(orderNo)}</h2>
    <p>Hi${o.customerName ? ' ' + escapeHtml(o.customerName) : ''}, your order is ready to collect from ${escapeHtml(BRAND.fullName)}.</p>
    <div class="addr">
      <b>COLLECT FROM</b>
      ${escapeHtml(fullAddress)}
    </div>
    <p>Please bring photo ID (Challenge 25) and your order number <b>${escapeHtml(orderNo)}</b>.</p>
    <p style="text-align:center;"><a class="btn" href="${o.isGuest ? `${storeUrl()}/track` : `${storeUrl()}/order/${o.id}`}">${o.isGuest ? 'Track your order' : 'View your order'} →</a></p>
    <p style="font-size:12px;color:#6b7280;">Questions? Reply to this email or call ${escapeHtml(BRAND.phone)}.</p>
  `;
  const { html, text } = layout(inner, { preview: `Order ${orderNo} is ready to collect` });
  return { subject: `${BRAND.fullName}: Order ${orderNo} is ready to collect`, html, text };
}

/* ---------- High-level "sendOrderEmails" used by the payment webhook ---------- */

export async function sendOrderEmails(o: OrderEmailData): Promise<{ customer: EmailResult; admin: EmailResult }> {
  const toAdmins = adminRecipients();
  const cust = buildCustomerConfirmation(o);
  const adm = buildAdminNewOrderAlert(o);

  const customerRes = await sendEmail({
    to: { email: o.customerEmail, name: o.customerName || undefined },
    subject: cust.subject,
    html: cust.html,
    text: cust.text,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  });

  let adminRes: EmailResult = { ok: true, provider: 'console', id: undefined };
  if (toAdmins.length) {
    adminRes = await sendEmail({
      to: toAdmins,
      subject: adm.subject,
      html: adm.html,
      text: adm.text,
    });
  } else {
    console.log('[email] EMAIL_ADMIN_ALERTS_TO not set — skipping admin alert email (customer email still sent/logged).');
  }

  return { customer: customerRes, admin: adminRes };
}
