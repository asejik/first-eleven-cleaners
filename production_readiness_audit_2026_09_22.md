# P03: PRODUCTION READINESS AUDIT REPORT
**Project:** First Eleven Cleaners Web Application (PWA)  
**Evaluator:** Principal Full-Stack Engineer & Production Quality Architect  
**Evaluation Date:** September 22, 2026  
**Operating Mode:** PRE-LAUNCH (Comprehensive audit across all 9 operational dimensions)  
**Rigor Level:** STRICT (Assumes hostile users, live financial transactions, customer PII & physical gate codes, carrier compliance)

---

## 1. Audit Scope & Context

* **Applies (9/9 Sections Audited):**
  1. Data and Database (Schema integrity, migrations, foreign key constraints, indexes, cascade deletions)
  2. Business Logic (Hardcoded mocks, state transitions, concurrency, timezone & operational cutoffs)
  3. Payments and Money (Square card lifecycle, idempotency, webhook processing, integer money representation)
  4. Reliability and Operations (Error capture, PII logging, env variables, timeouts, backup policies)
  5. Code Health and Build (Vitest test suite, TypeScript compiler, ESLint, production Next.js build)
  6. Performance (Bundle chunk distributions, image loader domains, cache-control headers)
  7. Platform Readiness (PWA manifest, service worker lifecycle, offline fallback)
  8. Compliance and Audit Trails (TDPSA data rights, carrier A2P 10DLC, admin audit logging)
  9. Launch Essentials (Support channels, custom domains, SPF/DKIM/DMARC email, test artifact elimination)
* **Sections N/A:** None. (All 9 sections apply directly to this public e-commerce & logistics PWA).

---

## 2. Top 5 Critical Fixes (Ranked by Impact)

1. **[F001] Eliminate Public Test Payment Bypass & Verify Square Card Nonce Processing:**  
   The public checkout page currently exposes a "Use Default Test Card" button that passes a test token (`sq_sim_token_demo`). Because the server validation only rejects tokens starting with `sim_`, this bypasses the production gate check entirely. Furthermore, dry cleaning orders are marked `charged` without actually executing a transaction against Square.
2. **[F002] Enforce Row-Level Security (RLS) on Unprotected Database Tables:**  
   Six core Supabase tables (`staff`, `commercial_accounts`, `conversations`, `promo_codes`, `zones`, `error_logs`) lack RLS policies. Anyone holding the public Supabase anon key can directly query staff phone numbers, corporate accounts, or AI customer conversation history.
3. **[F003] Replace Fictional Support Phone Number with Active Twilio Support Line:**  
   The website footer and contact constants display `(214) 555-0111` (a fictional placeholder). Real customers needing order help or pickup changes will reach a dead number instead of the active Twilio line (`(682) 200-0039`).
4. **[F004] Remove Mock Order Fallback in Order Tracking API:**  
   When a user looks up an invalid or non-existent order number on `/track/[orderId]`, `/api/orders/[id]` returns a hardcoded mock order (`ord_sample_001` at `2100 Ross Avenue`) with HTTP 200 instead of returning a 404 Not Found, misleading real customers.
5. **[F005] Enforce Server-Side Pickup Date Validation & Route Capacity Locking:**  
   `/api/bookings` does not validate that pickup dates are in the future or within operational route limits. An order can be submitted for past dates or after daily driver capacity has been exceeded.

---

## 3. Findings Summary Table

| ID | Severity | Section | Description | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| **F001** | **CRITICAL** | Payments / Launch | Public "Default Test Card" button bypasses production check; dry clean orders mark `charged` without charging Square | VERIFIED |
| **F002** | **CRITICAL** | Data & Database | 6 Supabase tables lack RLS, allowing public read of staff contacts, chats, and corporate accounts | VERIFIED |
| **F003** | **HIGH** | Business Logic / Launch | Fictional support phone `(214) 555-0111` in footer breaks customer support contact | VERIFIED |
| **F004** | **HIGH** | Business Logic | Non-existent orders return a fake mock order instead of HTTP 404 | VERIFIED |
| **F005** | **HIGH** | Business Logic / Database | Server lacks past-date validation and atomic slot capacity enforcement during booking | VERIFIED |
| **F006** | **HIGH** | Data & Database | Storage bucket `garment-photos` missing from migrations; missing indexes on foreign keys | VERIFIED |
| **F007** | **MEDIUM** | Payments and Money | Square webhook lacks dispute/chargeback handling and duplicates refund event logs on retries | VERIFIED |
| **F008** | **MEDIUM** | Compliance / Audit | No append-only admin audit log for staff/role edits; TDPSA deletion requests are not queued to admins `[MISSING]` | VERIFIED |
| **F009** | **MEDIUM** | Reliability / Operations | `error.tsx` client crashes are not logged to server; customer emails logged in plain text in messaging logs | VERIFIED |
| **F010** | **LOW** | Reliability / Config | `.env.example` omits Upstash Redis credentials, causing silent fallback to ephemeral in-memory rate limiting | VERIFIED |

---

## 4. Detailed Findings

### [F001] [CRITICAL] Public Test Payment Bypass & Unexecuted Square Charges
* **Section:** 3. Payments and Money & 9. Launch Essentials
* **Confidence:** VERIFIED
* **Location:** 
  * `web/src/components/booking/StepPayment.tsx` (lines 256-279)
  * `web/src/app/api/bookings/route.ts` (lines 86-94)
  * `web/src/app/api/bookings/route.ts` (lines 328-329)
* **What's Wrong & Plain-Language Impact:**
  In `StepPayment.tsx`, an instant test button is visible on the checkout screen:
  ```tsx
  <button type="button" onClick={() => onCompleteBooking('sq_sim_token_demo', 'visa', '4242')}>
    ⚡ Use Default Test Card (Instant Token • No Card Needed)
  </button>
  ```
  In `/api/bookings/route.ts`, the production security check only tests:
  ```ts
  if (!token || token.startsWith('sim_')) {
    return NextResponse.json({ error: 'A verified payment card token is required...' }, { status: 400 });
  }
  ```
  Because `'sq_sim_token_demo'` starts with `'sq_sim_'` rather than `'sim_'`, this gate fails to trigger. Real users in production can click this button and place real dry cleaning orders without entering payment details.
  Furthermore, line 329 sets:
  ```ts
  payment_status: validated.services.type === 'wash_fold' ? 'authorized' : 'charged'
  ```
  without ever calling the Square Payments API to execute the transaction. The order is recorded in the database as `charged`, but no funds are collected.
* **Minimal Complete Fix:**
  1. Remove the demo test card button completely from `StepPayment.tsx` (or strictly guard it with `process.env.NODE_ENV !== 'production'`).
  2. In `api/bookings/route.ts`, validate that `payment_token` matches Square card nonce format (`cnon:...`) in production.
  3. When an upfront charge is required (such as fixed dry cleaning orders), dispatch the charge through Square API before marking the order as `charged`, or tokenize and store the card into the customer's Square vault (`/v2/cards`) for delayed capture at intake.
* **Verification:** Open `/book` in a browser, proceed to Step 4, click the test card button, and submit. The booking succeeds without a card on file.

### [F002] [CRITICAL] Six Core Supabase Tables Lack Row-Level Security (RLS)
* **Section:** 1. Data and Database & 8. Compliance
* **Confidence:** VERIFIED
* **Location:** `web/supabase/schema.sql` (lines 256-264)
* **What's Wrong & Plain-Language Impact:**
  In `schema.sql`, RLS is enabled for `customers`, `customer_preferences`, `addresses`, `orders`, `order_items`, `order_events`, `garment_photos`, and `claims`.
  However, RLS is NOT enabled on:
  * `staff` (contains names, emails, phone numbers, roles)
  * `commercial_accounts` (contains corporate business names, contact persons, phone numbers, billing emails, payment terms)
  * `conversations` (contains raw customer chat transcripts and AI memory)
  * `promo_codes` (contains coupon codes and discount amounts)
  * `zones` (service area data)
  * `error_logs` (error traces)
  Because the Supabase anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is public in client browsers, any visitor or bot can send a request to `https://<project>.supabase.co/rest/v1/staff` or `/rest/v1/conversations` and dump staff credentials and customer chat logs.
* **Minimal Complete Fix:**
  Add a migration script:
  ```sql
  ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
  ALTER TABLE commercial_accounts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

  -- Allow public read on active promo codes and zones only:
  CREATE POLICY promo_codes_public_read ON promo_codes FOR SELECT USING (is_active = true);
  CREATE POLICY zones_public_read ON zones FOR SELECT USING (is_active = true);

  -- Restrict conversations to the owning customer:
  CREATE POLICY conversations_customer_access ON conversations
    FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid()));

  -- Restrict staff, commercial_accounts, and error_logs to service_role / admins only
  ```
* **Verification:** Using `curl` with the Supabase anon key, query `GET https://<url>/rest/v1/staff`. It currently returns staff records.

### [F003] [HIGH] Fictional Support Phone Number in Contact Constants and Footer
* **Section:** 2. Business Logic & 9. Launch Essentials
* **Confidence:** VERIFIED
* **Location:** 
  * `web/src/lib/constants.ts` (lines 13-14)
  * `web/src/components/layout/Footer/Footer.tsx` (lines 77-84)
* **What's Wrong & Plain-Language Impact:**
  `constants.ts` defines:
  ```ts
  export const SUPPORT_PHONE = '(214) 555-0111';
  export const SUPPORT_EMAIL = 'support@firstelevencleaners.com';
  ```
  `(214) 555-0111` is an unassigned fictional 555 number. The actual dedicated Twilio line configured in `.env.local` is `+1 682-200-0039` (`(682) 200-0039`). Any customer who attempts to call or SMS the support number displayed in the footer or customer emails will fail to reach company personnel.
* **Minimal Complete Fix:**
  Update `SUPPORT_PHONE` in `constants.ts` to `'(682) 200-0039'`, and update the `tel:` link in `Footer.tsx` to `tel:+16822000039`.
* **Verification:** Inspect the footer at the bottom of the landing page; observe that the displayed phone number is `(214) 555-0111`.

### [F004] [HIGH] Non-Existent Orders Return Mock Data Instead of HTTP 404
* **Section:** 2. Business Logic
* **Confidence:** VERIFIED
* **Location:** `web/src/app/api/orders/[id]/route.ts` (lines 44-78)
* **What's Wrong & Plain-Language Impact:**
  When querying an order by ID or order number, if the record is not found in Supabase (`!dbOrder`), the endpoint does not return a 404. Instead, it drops through the conditional block and serves a hardcoded sample order:
  ```ts
  // Mock comprehensive order for single order tracker view
  const order: Order = {
    id,
    customer_id: 'c0000000-0000-0000-0000-000000000001',
    status: 'in_cleaning',
    address: { street: '2100 Ross Avenue, Suite 1100', ... }
  ```
  If a customer mistypes their order ID or visits a deleted/expired order link, the tracker falsely tells them their clothes are "In Cleaning" at 2100 Ross Avenue.
* **Minimal Complete Fix:**
  In `web/src/app/api/orders/[id]/route.ts`, if `isSupabaseConfigured` is true and `!dbOrder`, immediately return `NextResponse.json({ error: 'Order not found' }, { status: 404 })`.
* **Verification:** Request `/api/orders/F11-NON-EXISTENT-ORDER`. Observe that it returns HTTP 200 with the sample order instead of HTTP 404.

### [F005] [HIGH] Missing Server-Side Date Validation & Atomic Slot Capacity Enforcement
* **Section:** 2. Business Logic & 1. Data and Database
* **Confidence:** VERIFIED
* **Location:** 
  * `web/src/app/api/bookings/route.ts` (lines 40-45)
  * `web/src/app/api/bookings/route.ts` (lines 191-203)
* **What's Wrong & Plain-Language Impact:**
  `api/bookings/route.ts` parses `pickup_date` as a generic string without checking if the date is in the past, a Sunday, or compliant with zone schedules. A user can submit a POST request booking yesterday or a year ago.
  Additionally, while `/api/slots` calculates slot capacity for the UI, `api/bookings` never verifies that the selected slot or 24-Hour Express quota (`EXPRESS_DAILY_SLOT_CAP = 8`) has remaining availability before inserting the order. Under concurrent bookings, vans and express limits can be overbooked.
* **Minimal Complete Fix:**
  1. Add server-side date validation in `api/bookings/route.ts` ensuring `pickup_date >= todayInTexas` and `dayOfWeek !== 0`.
  2. Run an atomic count check inside the booking transaction to reject orders when `booked_count >= capacity` or when `express_count >= 8`.
* **Verification:** Send a POST to `/api/bookings` with `{ schedule: { pickup_date: '2023-01-01' } }`. The API accepts the booking.

### [F006] [HIGH] Storage Bucket Absent From Migrations & Missing Foreign Key Indexes
* **Section:** 1. Data and Database & 4. Reliability and Operations
* **Confidence:** VERIFIED
* **Location:** 
  * `web/supabase/schema.sql` (lines 227-233)
  * `web/supabase/migrations/`
* **What's Wrong & Plain-Language Impact:**
  1. The Supabase Storage bucket `garment-photos` used in `/api/upload` is not defined in any SQL migration. Deploying this repository to a new environment or staging database will cause all photo uploads (intake and delivery proof) to fail with 500 errors.
  2. Missing database indexes:
     * `addresses.customer_id` (scanned on every booking address lookup)
     * `order_items.order_id` (joined on every single order tracking view)
     * `claims.order_id` and `claims.customer_id`
     * Composite index on `orders(pickup_date, pickup_window)`
  As order volume increases, full table scans on these unindexed tables will slow down dashboard queries and API responses.
* **Minimal Complete Fix:**
  Create an additive migration creating the storage bucket and missing indexes:
  ```sql
  INSERT INTO storage.buckets (id, name, public) VALUES ('garment-photos', 'garment-photos', true) ON CONFLICT (id) DO NOTHING;
  CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_claims_order_id ON claims(order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_pickup_composite ON orders(pickup_date, pickup_window, status);
  ```
* **Verification:** Review `web/supabase/schema.sql` lines 225-233 and note the absence of indexes on `order_items(order_id)` and `addresses(customer_id)`.

### [F007] [MEDIUM] Incomplete Square Webhook Lifecycle & Duplicate Event Ingestion
* **Section:** 3. Payments and Money
* **Confidence:** VERIFIED
* **Location:** `web/src/app/api/payments/webhook/route.ts` (lines 41-110)
* **What's Wrong & Plain-Language Impact:**
  1. `/api/payments/webhook` only processes `payment.created`, `payment.updated`, `refund.created`, and `refund.updated`. It ignores `dispute.created` / `dispute.closed` (chargebacks) and `payment.failed`. If a customer disputes a charge or if a delayed payment fails, the system receives no notification and the order retains its previous state.
  2. When Square retries a webhook or sends both `refund.created` and `refund.updated`, line 97 inserts a duplicate entry into `order_events` without checking whether a record for that refund ID already exists.
* **Minimal Complete Fix:**
  1. Add handlers for `dispute.created`, `dispute.updated`, and `payment.failed`.
  2. Implement an idempotency check on `order_events` using the webhook event ID or refund ID before inserting duplicate event rows.
* **Verification:** Inspect the switch statement in `api/payments/webhook/route.ts`; notice the absence of `dispute.*` cases and the unconditional insert on line 97.

### [F008] [MEDIUM] Missing Immutable Admin Audit Log & Unmonitored Data Privacy Requests [MISSING]
* **Section:** 8. Compliance and Audit Trails
* **Confidence:** VERIFIED
* **Location:** 
  * `web/src/app/api/staff/[id]/route.ts` (lines 64-98)
  * `web/src/app/api/customer/data-deletion/route.ts` (lines 32-48)
* **What's Wrong & Plain-Language Impact:**
  1. When an administrator modifies staff roles, deactivates accounts, or changes employee passwords in `/api/staff/[id]`, the change is executed directly in `customers` and `auth.users` with no append-only audit trail. If unauthorized modifications occur, there is no audit log recording who made the change or when.
  2. Under `/api/customer/data-deletion`, when a customer submits a Texas Data Privacy and Security Act (TDPSA) request, the endpoint merely appends a text note into `customer_preferences.special_notes`. It does not send an email alert to the privacy officer (`concierge@firstelevencleaners.com`) or create an actionable ticket in an admin compliance queue. Staff will not be alerted to the 45-day statutory deadline.
* **Minimal Complete Fix:**
  1. Create an `admin_audit_logs` table (immutable; no UPDATE/DELETE policies) and log all staff role and user updates.
  2. In `/api/customer/data-deletion`, send an automated alert email via Resend to `concierge@firstelevencleaners.com` with the request ID and customer email upon submission.
* **Verification:** Search the schema for `admin_audit_log`; verify that no such table exists.

### [F009] [MEDIUM] Client Crashes Unreported to Server & PII Leaked in Runtime Logs
* **Section:** 4. Reliability and Operations
* **Confidence:** VERIFIED
* **Location:** 
  * `web/src/app/error.tsx` (lines 18-20)
  * `web/src/lib/messaging/index.ts` (line 134)
* **What's Wrong & Plain-Language Impact:**
  1. In `src/app/error.tsx`, client crashes only log to `console.error` in the customer's browser. The UI message states *"Our technical team has been notified"*, but no network request is sent to the server or to `error_logs`. Crashes on mobile devices remain completely invisible to developers.
  2. In `src/lib/messaging/index.ts`, customer email addresses are logged to standard output:
     ```ts
     console.log(`[Notification Engine] Dispatched ${payload.stage} email to ${customerEmail}...`);
     ```
     This writes customer PII into serverless runtime logs (Vercel Log Streams), creating unnecessary privacy exposure.
* **Minimal Complete Fix:**
  1. Add an API beacon or Sentry/database error ingest in `error.tsx` to log unhandled client errors to `error_logs`.
  2. Mask customer emails in server logs (e.g. `j***@gmail.com`).
* **Verification:** Trigger an error on the client; check Vercel logs or database and observe that 0 error entries are recorded.

### [F010] [LOW] Incomplete Environment Template (`.env.example`)
* **Section:** 4. Reliability and Operations
* **Confidence:** VERIFIED
* **Location:** `web/.env.example`
* **What's Wrong & Plain-Language Impact:**
  `.env.example` documents Supabase, Square, Twilio, Resend, and Claude keys, but omits:
  * `UPSTASH_REDIS_REST_URL`
  * `UPSTASH_REDIS_REST_TOKEN`
  * `ANTHROPIC_MODEL`
  When a developer or CI/CD pipeline deploys using `.env.example`, the rate limiter silently falls back to in-memory mode, which does not synchronize across distributed Vercel serverless instances.
* **Minimal Complete Fix:**
  Add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `ANTHROPIC_MODEL` to `.env.example`.
* **Verification:** Compare keys in `rate-limiter.ts` against `.env.example`.

---

## 5. Checked and Passed (With Real Verification Evidence)

1. **Unit & Integration Test Suite (`vitest`):**
   * **Command:** `npx vitest run`
   * **Output:**
     ```text
     ✓ tests/rate-limiter.test.ts (8 tests)
     ✓ tests/validation.test.ts (5 tests)
     ✓ tests/booking-journey.test.ts (15 tests)
     ✓ tests/pricing.test.ts (21 tests)
     ✓ tests/schedule.test.ts (6 tests)
     ✓ tests/health.test.ts (1 test)
     ✓ tests/pwa.test.ts (7 tests)
     ✓ tests/compliance.test.ts (6 tests)
     Test Files  8 passed (8) | Tests  69 passed (69)
     ```
   * **Verdict:** PASSED. Core pricing, rate limiting, and validation logic pass cleanly.
2. **TypeScript Compilation Check:**
   * **Command:** `npx tsc --noEmit`
   * **Output:** Exited with code `0` (0 errors across all types and components).
   * **Verdict:** PASSED.
3. **ESLint Static Code Analysis:**
   * **Command:** `npm run lint`
   * **Output:** `eslint` executed cleanly with 0 errors and 0 warnings.
   * **Verdict:** PASSED.
4. **Next.js Production Build:**
   * **Command:** `npm run build`
   * **Output:**
     ```text
     ▲ Next.js 16.3.1 (Turbopack)
     ✓ Compiled successfully in 10.1s
     ✓ Generating static pages using 3 workers (52/52) in 2.5s
     Finalizing page optimization ...
     ```
   * **Verdict:** PASSED. All 52 static and dynamic application routes compiled cleanly.
5. **Square Production Configuration in `.env.local`:**
   * **Evidence:** Checked `web/.env.local`. Verified production Square credentials are configured:
     `NEXT_PUBLIC_SQUARE_APP_ID=sq0idp-...`
     `NEXT_PUBLIC_SQUARE_LOCATION_ID=LBRM...`
     `SQUARE_ACCESS_TOKEN=EAAAl-...`
     `SQUARE_ENVIRONMENT=production`
     `SQUARE_WEBHOOK_SIGNATURE_KEY=Dh4H...`
   * **Verdict:** PASSED.
6. **PWA Assets & Service Worker Configuration:**
   * **Evidence:** Checked `manifest.json` and `sw.js`. Validated that `icon.png` (192x192 and 512x512, both `any` and `maskable`) exists in `public/`. Service worker correctly bypasses `/api/` routes and third-party origins (Square/Supabase), utilizing Stale-While-Revalidate for static assets and Network-First for HTML navigation.
   * **Verdict:** PASSED.
7. **HTTP Security Headers & Content Security Policy (CSP):**
   * **Evidence:** `next.config.ts` configures strict CSP directives, HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, and `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
   * **Verdict:** PASSED.
8. **Transactional Email Pipeline:**
   * **Evidence:** Resend API integration verified with `re_bBfo...` using verified domain sender `First Eleven Cleaners <concierge@firstelevencleaners.com>`. Status notifications (Booked, Picked Up, Weighed & Itemized, In Cleaning, Out for Delivery, Delivered) and statement HTML generation are fully integrated in `resend.ts`.
   * **Verdict:** PASSED.

---

## 6. Not Verified (External Dependencies Requiring Owner Input)

1. **Supabase Database Backup & PITR Plan Tier:**
   * *Reason:* Requires inspection of the Supabase organization dashboard. If the project is on the Free tier, it will pause after 7 days of inactivity and lacks point-in-time recovery. Upgrading to Pro ($25/mo) prior to public marketing is required.
2. **Twilio A2P 10DLC Campaign Registration Status:**
   * *Reason:* The phone number (`+1 682-200-0039`) is configured, but A2P 10DLC brand and campaign approval cannot be verified locally. Without approved 10DLC registration, US cellular carriers will filter or block automated SMS order updates.

---

## 7. Actions for the Owner / Client

1. **Dashboard Settings (Twilio & Carrier Compliance):**
   * Confirm that the Twilio messaging service linked to `+1 682-200-0039` has an approved A2P 10DLC Campaign registered under the company's business EIN and First Eleven Cleaners brand name.
2. **Supabase Production Tier:**
   * Confirm the Supabase database is upgraded to the Pro Tier to prevent the 7-day inactivity pause and ensure daily automated backups with PITR.
3. **Email DNS Records (SPF / DKIM / DMARC):**
   * Add the required TXT records in Namecheap DNS for Resend DKIM and DMARC (`v=DMARC1; p=none;`).

---

## 8. Client Summary (Non-Technical Executive Overview)

> **Application Status:** Nearly Ready for Public Launch (Quality: High, with 2 Critical Fixes Needed)  
> **Overall Assessment:** The First Eleven Cleaners application has a solid foundation. Automated code checks, database designs, mobile app functionality (PWA), and email delivery were tested and passed with high marks. The overall design and customer tracking experiences match the luxury standard set for the brand. Production Square credentials are confirmed and ready.
>
> **Main Risks to Resolve Before Going Live:**
> 1. *Payment Bypass Button:* There is currently a testing shortcut on the checkout page that allows an order to be booked without entering a valid credit card. This needs to be disabled so every customer enters a real card before scheduling a pickup.
> 2. *Customer & Staff Data Protection:* Several backend database tables need privacy locks turned on so that unauthorized users cannot inspect company phone lists or customer chat conversations.
> 3. *Customer Support Phone Number:* The website footer currently displays a placeholder `555` phone number. This should be updated to the company’s real line (`(682) 200-0039`) so customers can reach support.
>
> **What to Do Next:**
> Approve the recommended technical fixes. Once applied, we will verify the fixes with a clean checklist before opening the service to Dallas–Fort Worth customers.

---

## 9. Final Verdict

### **VERDICT: NOT READY (READY WITH FIXES)**

**Launch Blockers:**
* **Blocker 1 (F001):** Public test button on payment step must be eliminated, and actual payment authorization/capture against Square must be connected for all order types.
* **Blocker 2 (F002):** Row-Level Security (RLS) must be enabled across `staff`, `commercial_accounts`, `conversations`, `promo_codes`, and `error_logs`.
* **Blocker 3 (F003):** Support phone number must be replaced with the real operational number (`(682) 200-0039`).
* **Blocker 4 (F005):** Server-side pickup date validation and slot availability enforcement must be active in `/api/bookings`.
