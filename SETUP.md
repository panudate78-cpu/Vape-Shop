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
