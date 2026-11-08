# Dr Cloud Vape Shop — Setup & Services Reference

This file lists every third-party service/website used to build and run the shop,
plus every environment variable that must (or can) be set in Vercel for the site
to work end-to-end.

---

## Services / websites used

### Core hosting & database (already set up, don't change)

| Service | What it does | URL |
|---|---|---|
| **GitHub** | Hosts the code — `panudate78-cpu/Vape-Shop`. Pushes to `main` auto-deploy. | https://github.com/panudate78-cpu/Vape-Shop |
| **Vercel** | Hosts the live site. Auto-builds on every push to `main`. Domains, env vars, logs, analytics all here. | https://vercel.com/dashboard |
| **Neon** | Serverless PostgreSQL database (region: eu-west-2 London). Free tier. The shop stores products, orders, users, categories here. **Use the pooled connection for Vercel, direct connection for local scripts/seed.** | https://console.neon.tech |

### Email (you need to wire up)

| Service | What it does | URL | Free tier |
|---|---|---|---|
| **Resend** | Transactional email (order confirmations to customers, new-order alerts to you). | https://resend.com | 3,000 emails/month free — plenty for a single shop. |

### Payment (still on mock — you'll need this to go live)

Vape is a **high-risk category** in the UK. Standard Stripe/PayPal will shut you down.
You need a high-risk-friendly processor. One of these:

| Service | Notes | URL |
|---|---|---|
| **NMI** (recommended) | Most UK vape shops use NMI via a high-risk merchant account reseller. | https://nmi.com |
| **Authorize.net** via a high-risk merchant reseller | Works through resellers that accept vape (not direct signup). | https://www.authorize.net |
| **Viva Wallet** | EU/UK acquirer, sometimes accepts vape. | https://www.viva.com |
| **Square** | Vape-friendly in certain regions — check current UK policy before committing. | https://squareup.com |

> Until you pick a real processor, checkout runs in **mock mode** — orders are recorded
> as "paid" immediately after checkout for demo/testing.

### Media uploads (optional future)
Product images currently upload to Vercel's local `/public/uploads` directory, which is
**ephemeral** on serverless — files disappear on redeploy. For production, move uploads to:

| Service | What it does | URL |
|---|---|---|
| **Vercel Blob** | Drop-in file storage, easiest integration with Vercel. | https://vercel.com/docs/storage/vercel-blob |
| Cloudflare R2 / AWS S3 | Cheaper at scale if you have many images. | https://www.cloudflare.com/developer-platform/r2 |

### Other useful links

| Service | What | URL |
|---|---|---|
| **Google Maps** (no API key needed) | The Visit page embeds Google Maps via a plain iframe — no API key, no billing. Directions link opens in Google Maps app/site. | https://www.google.com/maps |
| Your **domain registrar** (e.g. Namecheap, GoDaddy, Cloudflare) | Buy a domain (e.g. `drcloudchessington.co.uk`), point it at Vercel via Vercel Domains tab. | — |
| **Vercel Analytics** (optional) | Free visitor stats — one-click enable in Vercel project settings. | Vercel dashboard |

---

## Environment variables to set in Vercel

Go to **Vercel → your project → Settings → Environment Variables**.
Add all the **Required** ones below. The rest are optional or have defaults.

All variables should be set for **Production** (and Preview/Development if you want them
to match locally).

### Required

| Variable | What to put | Example |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** PostgreSQL connection string (copy from Neon dashboard → Connection string → **Pooled**). Use `?sslmode=require`. | `postgresql://neondb_owner:xxxx@ep-xxx-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require` |
| `SESSION_PASSWORD` | A long random string used to encrypt cookies. Generate with `openssl rand -base64 32` on a Mac/Linux terminal, or mash the keyboard for 40+ random chars. | `8a7f...randomstring...xyz` |

### Payment

| Variable | Value | Default |
|---|---|---|
| `PAYMENT_GATEWAY` | `mock` until you integrate a real processor, then `nmi` / `authorize_net` / `viva` / `square`. The adapter code for real gateways is a placeholder — it falls back to mock so you can test. | `mock` |
| `WEBHOOK_SECRET` | Shared secret for payment webhook verification. Random string. Defaults to `dev-secret` (only allowed in dev mode). | (generate random) |

### Email (Resend) — leave blank until you sign up

| Variable | What to put | Required? |
|---|---|---|
| `RESEND_API_KEY` | API key from Resend dashboard (Settings → API Keys). While blank, emails are **logged to Vercel function logs** (preview mode — nothing actually sent). | Optional (safe to leave blank at first) |
| `EMAIL_FROM` | "From" address — must be a verified sender/domain in Resend. Format: `Dr Cloud <orders@yourdomain.co.uk>`. Until you verify a domain you can use the test `onboarding@resend.dev` address (only sends to YOUR email, not customers). | Required when `RESEND_API_KEY` is set |
| `EMAIL_ADMIN_ALERTS_TO` | Comma-separated list of emails that get a **🔔 New order** alert every time someone pays — put your Gmail/shop email(s) here. | Recommended |
| `EMAIL_REPLY_TO` | Reply-To address (where replies to order confirmations land — different from the "from" address if you want). | Optional |

### Store branding (optional — sensible defaults are built in)

| Variable | Default | What to put |
|---|---|---|
| `STORE_NAME` | `Dr Cloud Chessington` | Display name in email footers, etc. |
| `STORE_PHONE` | `07947 357934` | Contact phone in email footers. |
| `STORE_ADDRESS` | `Unit 4, Bridge Road, Chessington KT9 2RT` | Single-line address in email footers. |
| `STORE_URL` | Auto-detected from Vercel (`VERCEL_URL`) or `https://vapeshop202626.vercel.app` | Public site URL (update once you add a real domain). |
| `NEXT_PUBLIC_AGE_THRESHOLD` | `18` | Minimum purchase age (UK = 18). |

### Variables you don't need to touch

| Variable | Notes |
|---|---|
| `VERCEL_URL` | Set automatically by Vercel. |
| `NODE_ENV` | Set automatically (`production` / `preview` / `development`). |
| `NEXT_PUBLIC_BUILD_ID` | Shown in footer as "v7 · prod" — set/overridden automatically. |

---

## Seeding the database

After your `DATABASE_URL` is set and the first deploy succeeds, visit:

```
https://<your-domain>/api/seed
```

in a browser once. That creates the admin account, categories, and starter products.
Admin login:

- Email: `admin@vapeshop.co.uk`
- Password: `Admin123!`

⚠️ Change the admin password after first login, or edit the seed file before running.

---

## Local development quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy env template
cp .env.example .env.local

# 3. Fill in DATABASE_URL in .env.local
#    Use the NEON DIRECT connection (not pooled) locally to avoid pooler issues.

# 4. Seed the DB (if not done already)
#    Visit http://localhost:3000/api/seed once

# 5. Run dev server
npm run dev
```

The site will be live at http://localhost:3000.

---

## QuickBooks integration

There are three ways to get Dr Cloud sales into QuickBooks, depending on how automated you want to be.

### Option 1 — CSV export (built in, works today)

From the admin dashboard click **📊 QuickBooks export** (or hit `/api/admin/quickbooks?from=YYYY-MM-DD&to=YYYY-MM-DD&source=online|pos|all`). You get a CSV in QuickBooks Online's **Sales Receipts** format with these columns: `Date, Customer, Email, Payment Method, Reference No., Deposit To, Memo, Product/Service, Description, Qty, Rate, Amount, Tax, Class`.

- Each order line is a row; delivery fees and discounts appear as separate lines.
- Reference numbers are `ORD-123` for online orders and `POS-123` for in-store sales.
- Payment method is set to `Cash` / `Card` for POS sales, `Stripe` / `Cash on collection` / `Online` for web orders.
- The `Class` column tags rows `Online` or `In-store` so you can run class-based P&L reports.

Import into QBO: **Settings → Import data → Invoices / Sales receipts → Browse** → upload the CSV. Map the columns (QBO auto-matches most of them) and import.

Optional env vars (add in Vercel) to control QBO mapping:
- `QB_DEPOSIT_TO` (default `Sales`) — bank/current-asset account to deposit the receipt into (e.g. `Business Current Account`).
- `QB_DEFAULT_ITEM` (default `Sales`) — Product/Service name used for product lines.
- `QB_SHIPPING_ITEM` (default `Postage`) — Product/Service name for delivery lines.
- `QB_DISCOUNT_ITEM` (default `Discounts`) — Product/Service name for discount lines (must be a "Discount" type in QBO if you want the totals to net correctly).

### Option 2 — Zapier / Make (no code, ~15 min setup)

Use Zapier's "Webhooks by Zapier" trigger plus the "QuickBooks Online" action:
1. In Zapier, make a new Zap with trigger **Catch Hook** → copy the webhook URL.
2. Set `ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/...` in Vercel env.
3. Add a Zapier step: **QuickBooks Online → Create Sales Receipt**, mapping order fields.
4. Sales receipts will be created automatically ~1 min after every paid order.

*(I can wire the webhook call in — say the word and I'll add it.)*

### Option 3 — Native OAuth (real-time, two-way)

Use QBO's OAuth 2.0 + QuickBooks Accounting API to push sales receipts, refunds, and products straight to QBO after every order, and pull product/price updates back. This needs a QBO developer account and an Intuit app connected to your company file — ~1–2 days work. Best when you're at higher volume and want bookkeeping to be invisible.

### Option 4 — Paid connector (Commerce Sync / Synder / Webgility)

These purpose-built e-commerce ↔ QBO connectors handle VAT, payout reconciliation, and Square/Stripe matching out of the box. You just point them at your Dr Cloud store's public URLs — they work with standard carts but will need a small custom integration for a bespoke Next.js store, so only worth it once you're doing real volume.

**VAT note:** UK vape e-liquid carries 20% standard-rate VAT; nicotine-free hardware/accessories may also be standard-rated. Currently prices are entered inclusive of VAT at till (as is standard for UK retail). When importing, mark the Product/Service items in QBO as **Standard (20%) Inclusive of VAT** so gross figures match what the customer paid. Let me know if you want me to add a VAT column to the export.
