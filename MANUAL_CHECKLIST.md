# Manual checklist: what the owner must do outside the software

The software items on the project list are built in code, but several of them can only be finished by people, accounts, hardware or legal review. This file lists those tasks. Tick each box when it is done and verified.

Notes:
- The code has been checked, but most features have not been tested end to end in a browser.
- The code cannot see live data, Vercel settings or Neon settings. Check those yourself.

---

## 1. Do first: security and go-live blockers

- [ ] **Change the default admin password.** The seed creates `admin@vapeshop.co.uk` with password `Admin123!`. Change it.
- [ ] **Delete demo accounts** (for example `demo@customer.co.uk`) if the seed has ever run on production.
- [ ] **Keep `ALLOW_SEED` off in production.** The seed route is closed unless this is `true`. Do not set it to `true` on production.
- [ ] **Set the Vercel environment variables for Production:**
  - [ ] `DATABASE_URL`: Neon pooled connection string, with `?sslmode=require`
  - [ ] `SESSION_PASSWORD`: random string of 32 or more characters (`openssl rand -base64 32`)
  - [ ] `WEBHOOK_SECRET`: random string
- [ ] **Card payments:** `PAYMENT_GATEWAY` is still `mock`. The real gateway adapters are placeholders.
  - [ ] Choose a payment processor and open the merchant account
  - [ ] Have the integration built and tested
  - [ ] Decide how the till handles external card payments versus an integrated terminal
  - [ ] Test failed payments end to end

## 2. Accounts and services to set up

- [ ] **Email (Resend)**
  - [ ] Create a Resend account and verify the sending domain
  - [ ] Set `RESEND_API_KEY` and `EMAIL_FROM`
  - [ ] Set `EMAIL_ADMIN_ALERTS_TO` and `EMAIL_REPLY_TO` if you want them
  - [ ] Send a test order confirmation and a test collection-ready email to a real inbox
- [ ] **Backups (Neon)**
  - [ ] Turn on automated backups and point-in-time restore
  - [ ] Restore one backup into a separate test database and check the data
- [ ] **Separate test and production**
  - [ ] Create a second Neon branch for testing
  - [ ] Create a Vercel preview environment with its own variables and database
- [ ] **Error monitoring and alerts**
  - [ ] Set up error tracking (for example Sentry). The code does not include it yet.
  - [ ] Set up an alert for failed payments

## 3. Verify outside the software

- [ ] **Accounting exports (the repo has no automated test for these)**
  - [ ] Import a real sales export into a QuickBooks Online trial or test company
  - [ ] Import a real Xero sales invoice CSV into a Xero demo or test organisation
  - [ ] Import a real Sage export into a Sage test company
  - [ ] Record the result of each import, including any errors
  - [ ] Set `XERO_SALES_ACCOUNT`, `SAGE_SALES_NOMINAL` and `QBO_DEPOSIT_ACCOUNT` to match your chart of accounts
- [ ] **VAT:** check the VAT rate for each category in Categories, and confirm the rates with your accountant
- [ ] **Legal wording:** have the Returns, Delivery and Privacy pages reviewed against your actual policies. The wording was drafted in the code and is not legal advice.
- [ ] **Compliance:** confirm which rules apply to your shop, such as TPD and MHRA notification. Check the age-check, ID-check and refusal procedures. The software supports these procedures, but it does not ensure compliance.
- [ ] **Concurrency and interruption tests:** the repo has no automated test suite. On a test environment, test:
  - [ ] Duplicate sales from repeated clicks
  - [ ] Two customers buying the last item
  - [ ] Refunds
  - [ ] A dropped connection during a sale
- [ ] **Browser check** of the shop, mobile checkout and till. These have not been tested in a browser.

## 4. Shop equipment and staff

- [ ] **Hardware:** test each device on the till
  - [ ] Barcode scanner
  - [ ] Receipt printer
  - [ ] Label printer
  - [ ] Card terminal
  - [ ] Cash drawer
- [ ] **Barcodes:** print barcode labels for every variant, and check each barcode is unique
- [ ] **Staff accounts**
  - [ ] Create real owner, manager and cashier accounts
  - [ ] Set each person's PIN
  - [ ] Check cashiers cannot see costs, profit or refunds
  - [ ] Remove or disable any unused accounts
- [ ] **Procedures**
  - [ ] Write a short support and recovery process: who to call when the till or site is down, and how to handle the cash
  - [ ] Train staff on the till
  - [ ] Train staff on age checks and refusals

## 5. Data cleanup on live data

- [ ] **IVG variants:** open the product editor and check that all three IVG variants appear
- [ ] **Descriptions:** search product descriptions for raw colour codes such as `#14b8a6` and fix any that remain
- [ ] **Archive, don't delete:** archive discontinued products so past orders keep their details
- [ ] **Check the items marked done:** test the shop, mobile checkout and till with real data before relying on them
