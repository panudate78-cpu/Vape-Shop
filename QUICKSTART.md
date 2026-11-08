# Getting the Dr Cloud Vape Shop running live

You don't need a separate "test database" — **one Neon project with branches is all you need** (free tier covers dev + prod for a shop this size).

---

## 1. Create the Neon database (5 minutes)

1. Sign up at **https://neon.tech** (free tier is fine).
2. Create a project. Pick **AWS / Europe (London)** as the region — closest to Chessington for the lowest latency.
3. Neon creates a default database named `neondb` and a primary branch `main`.
4. On the project dashboard click **"Branch"** → create a branch called `dev` off `main` (instant, zero-cost copy).
   - You now effectively have two databases: `main` (prod) and `dev` (local/dev). Neon gives you a separate connection string for each.
5. Copy the **Connection string** from the **dev** branch (starts with `postgresql://…`). Make sure the "Connection string" toggle shows **"Prisma/Drizzle" format** (URL-encoded password).

That's it. No separate test database to pay for.

---

## 2. Run it locally

```bash
cd Vape-Shop
cp .env.example .env
# edit .env and set:
#   DATABASE_URL=<your Neon dev branch connection string>
#   SESSION_PASSWORD=<run: openssl rand -base64 32>
#   PAYMENT_GATEWAY=mock
#   NEXT_PUBLIC_AGE_THRESHOLD=18
npm install           # already done for you in this workspace
npx drizzle-kit push  # creates all tables in your Neon dev branch
npm run dev           # http://localhost:3000
```

The first page load auto-seeds:
- Categories, 7 demo products (Lost Mary, Elf Bar, Dinner Lady, IVG, Geekvape, Voopoo, Smok coils) with full variant matrices & stock levels
- 3 promo codes: `WELCOME10`, `FREESHIP`, `CLOUD20`
- Demo users:
  - **Admin:** `admin@vapeshop.co.uk` / `Admin123!`
  - **Customer:** `demo@customer.co.uk` / `Customer123!`

If auto-seed doesn't fire, visit http://localhost:3000/api/seed once.

Test end-to-end:
1. Open `/` → confirm the 18+ age gate works.
2. Browse `/shop`, add a Lost Mary to cart.
3. Go to `/checkout`, choose delivery or Click & Collect, enter DOB (>=18), tick compliance, "pay" with 4242… (mock gateway — no real charge).
4. You should land on `/order/<id>` with status "Processing". Stock decrements.
5. Login as admin → `/admin` → see revenue, low-stock alerts, recent orders; go to **Inventory** to edit stock/price inline; **Orders** to mark as ready/shipped with tracking.

---

## 3. Push to GitHub + deploy to Vercel (live)

```bash
# push this repo to a new GitHub repo (create one on github.com first)
git add .
git commit -m "Dr Cloud vape shop — full Next.js + Drizzle app"
git push origin arena/79ce1634-vape-shop
```

1. Go to **https://vercel.com** → New Project → import your GitHub repo.
2. Framework: **Next.js** (auto-detected).
3. **Environment Variables** (paste these in Vercel → Settings → Environment Variables):
   - `DATABASE_URL`           → Neon **main** branch connection string (for production)
   - `SESSION_PASSWORD`      → same long random string as local
   - `PAYMENT_GATEWAY`       → `mock` (for now; switch to `authorize_net`/`nmi` later)
   - `NEXT_PUBLIC_AGE_THRESHOLD` → `18`
4. Click **Deploy**.
5. After the first deploy succeeds, run the DB migrations against Neon **main**:
   - easiest: add the Neon `main` DATABASE_URL to a local `.env.production` or set it temporarily and run:
     ```bash
     DATABASE_URL='<main branch conn string>' npx drizzle-kit push
     ```
   - then hit `https://your-site.vercel.app/api/seed` once to populate products & demo users (or do it via `/admin` later).

### Preview deployments (optional, nice)
On Vercel, every PR gets a preview URL. You can wire Neon's **branch per PR** feature (Neon → Branches → "Create branch" + set `DATABASE_URL` via Vercel preview env vars) so previews get isolated DBs. Skip this for v1 — use the dev branch locally until you need it.

---

## 4. Going live for real (after testing)

1. **Domain**: In Vercel → Settings → Domains, add `drcloudchessington.co.uk` (or whatever you buy). Vercel gives you DNS records to point at.
2. **Real payments** (vape is high-risk in the UK — Stripe/Shopify Payments tend to reject you):
   - Open a high-risk merchant account with **Authorize.net via a high-risk reseller**, **NMI**, **Viva Wallet**, or **Square** (Square sometimes accepts vape retail).
   - Add your API keys to `.env` (`AUTHORIZE_NET_API_LOGIN_ID`, etc) and switch `PAYMENT_GATEWAY` to `authorize_net` / `nmi` / `viva` / `square`.
   - The webhook endpoint is already wired: `POST /api/webhooks/payment?gateway=<name>&secret=<webhook-secret>` — give this URL to your gateway. Stock is only ever deducted after a verified webhook (never on checkout), matching the spec.
3. **Age verification compliance (UK)**:
   - Self-declared DOB + 18+ gate is built in, but for TRPR/RSPCA best-practice, add a third-party age check at checkout (**VerifyMyAge**, **AgeChecked**, **1Account**) before shipping and enforce Challenge 25 on collection.
4. **Change default passwords**: log in as admin and update the seeded admin email/password, delete the `demo@customer.co.uk` account.
5. **Branding**: replace phone/address/hours in one place — `src/lib/brand.ts`. Change colours in `tailwind.config.js` (current: teal-500 on zinc).
6. **Images**: replace the ☁️ placeholder SVGs with real product photos in `public/images/` and set `products.images[]` per product (or via the admin product editor).

---

## Need a test database?

You **do not need to pay for a separate test database**. Use Neon branches:
- `main` → production
- `dev` → local development (branch off main; instant reset via "Reset from parent")
- Optionally `staging` → branch off main, wired to a Vercel preview env.

To reset dev data: Neon console → your `dev` branch → "Reset from parent" → instant. Way faster than restoring a separate test DB.

---

## Project map

```
src/
  app/               Next.js App Router pages (home, shop, product, checkout, order, account, track, login, register, admin/*)
  app/api/           All JSON API routes (auth, cart, products, checkout, webhook, orders, admin)
  components/        UI: chrome/header, age gate, cart drawer, product cards, etc.
  db/schema.ts       Postgres schema via Drizzle (users, products, variants, orders, promos, addresses, payments)
  db/index.ts        Lazy Drizzle client
  lib/               brand config, auth (bcrypt+iron-session), cart, payments adapters, seed data, formatters
```

---

## Troubleshooting

- *"DATABASE_URL is not set"*: you haven't created `.env` or haven't pasted the Neon connection string.
- *"relation … does not exist"*: run `npx drizzle-kit push` to create tables.
- *"too many connections"* on Neon free tier: the app uses `max: 10` connections which is fine; Vercel serverless may spike. If it becomes an issue, switch Neon to **Pooled connection** mode (add `-pooler` to the host) or use Neon's built-in connection pooling.
- Age gate keeps showing: make sure cookies are enabled (it sets `vs_age_verified=1`).
