# First Eleven Cleaners — Agent Coding & Operating Guidelines

## 1. Project Overview & Business Domain
First Eleven Cleaners (`first-eleven-cleaners`) is an enterprise-grade luxury garment care, dry cleaning, and laundry pickup/delivery service operating across the Dallas–Fort Worth (DFW) metroplex.
- **Brand Standards**: Concierge-level service, clean aesthetics (Navy `#0B1B3D`, Gold `#D4AF37`, crisp off-white `#FAFAFA`).
- **Operating Philosophy**: "If it is not written, it does not exist." High operational discipline, transparent pricing, documented intake, and verified delivery.
- **Root Directory**: `d:\projects\first eleven cleaners` (Next.js application resides in `web/`).

---

## 2. Technology Stack & Architecture
- **Framework**: Next.js 16.3.5 (App Router), React 19, TypeScript 5
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Supabase Auth)
- **Payment Processing**: Square Web Payments SDK (Card tokenization, payment authorization mode: $0 pre-auth at booking, final capture after intake inspection)
- **Styling**: Vanilla CSS Modules (`*.module.css`) and global theme tokens in `src/app/globals.css`.
  - **CRITICAL**: Do NOT install or use TailwindCSS. All components use scoped CSS Modules and design tokens.
- **Messaging**: Transactional email via Resend; SMS via provider abstraction.
- **Testing**: Vitest (`npm test` / `npx vitest run`).

---

## 3. Strict Operating Rules for AI Agents

### Rule 1: NO BROWSER AUTOMATION / TESTING
- **NEVER** launch browser subagents or automated browser testing.
- The human developer performs all manual browser and UI verification.
- Always provide clear instructions on how the user can test your changes.

### Rule 2: Shell Syntax (Windows PowerShell)
- The host OS is **Windows** running **PowerShell**.
- **NEVER** chain commands using `&&`. PowerShell does not support `&&` in older engines and can fail unpredictably.
- Use `;` to chain commands (e.g., `npx tsc --noEmit; npm test`) or run them as separate sequential commands.

### Rule 3: Verification & Test Discipline
- Before concluding any task or PR, **always** run:
  1. `npx tsc --noEmit` (Must complete with 0 errors)
  2. `npm test` or `npx vitest run` (All Vitest suites must pass)
- Never leave syntax errors, lint failures, or broken tests.

### Rule 4: Atomic Changes & Git Cleanliness
- Implement fixes and features one finding/task at a time.
- Verify `git status` before and after modifications.
- Do not make speculative refactorings or unsolicited rewrites of unrelated files.

### Rule 5: Safe Change Protocol (Mandatory for ALL Changes)
- Activate and strictly adhere to the `safe-change-protocol` skill (`.agents/skills/safe-change-protocol/SKILL.md`) for ANY code, database, configuration, refactoring, or bug fix change.
- Follow the 4-phase lifecycle:
  1. **Phase 1 (Orient & Plan)**: Confirm clean git working tree (or checkpoint), run baseline type check/tests, restate task, analyze impacted files & risk, reproduce bugs / inspect schema, and **STOP for approval**.
  2. **Phase 2 (Implement)**: Make only approved modifications following existing codebase patterns.
  3. **Phase 3 (Verify)**: Re-run checks (`npx tsc --noEmit; npm test`), confirm bug resolution, check for unused imports/variables.
  4. **Phase 4 (Report)**: Deliver report in the strict 7-section protocol format (Summary, Files changed, DB changes, Check results, Actions for developer, Manual test checklist, Risks/follow-ups).

---

## 4. Key File Map & Source of Truth (within `web/`)

| File Path | Purpose & Responsibility |
|---|---|
| `src/lib/constants.ts` | **Central source of truth** for pricing catalog, `calculateOrderFinancials()`, DFW Smart Coverage `ZONE_CONFIG`, and `resolveZoneByZip()`. Do NOT alter without explicit approval. |
| `src/lib/express.ts` | 24-Hour Express ("Match-Ready Tomorrow") business logic: +50% surcharge ($15 floor), morning pickup/delivery window cutoffs, item exclusions. |
| `src/lib/supabase/auth-helpers.ts` | Server-side API authentication and role verification (`verifyApiAuth()`). |
| `src/hooks/useAuth.tsx` | Client-side authentication context, session state, and role resolution. |
| `src/lib/supabase/schema.sql` | Supabase database schema, RLS policies, tables (`customers`, `orders`, `order_items`, `audit_logs`). |
| `src/app/book/page.tsx` | Client booking wizard (Address/Zip -> Items -> Schedule/Express -> Review & Square Payment). |
| `src/app/mission-control/page.tsx` | Admin operations center (order dispatch, route scheduling, zone governance, express capacity cap). |

---

## 5. Domain Rules & Business Constraints

### A. Guest Checkout Policy
- **Guest booking is a core product requirement.** First-time customers must NEVER be forced to register or create a password before completing a booking. Requiring upfront account creation creates friction and customer drop-off.
- **Account Creation Points**: Non-intrusive opportunities to create an account are offered:
  1. On the booking confirmation screen ("Save your password to track your driver in real-time").
  2. In the transactional confirmation email/SMS via a magic link or one-click password set.
- **Security & Integrity for Guest Bookings**:
  - The server (`/api/bookings`) must NEVER trust client-submitted prices or totals.
  - Recalculate all item prices, surcharges, zone minimums, environmental fees, and taxes server-side using `calculateOrderFinancials()`.
  - Rate-limit booking requests by IP and contact details.

### B. Smart Coverage Zone Model
DFW service area is partitioned into 4 zones with scaling order minimums:
1. **Zone 1 (Core)**: $45 minimum · Daily routes · 24-Hour Express eligible.
2. **Zone 2 (North Dallas Corridor)**: $60 minimum · Daily/alternating routes · 24-Hour Express eligible.
3. **Zone 3 (Tarrant & West Metro)**: $80 minimum · Scheduled routes (Tue & Fri) · No Express.
4. **Zone 4 (Extended North Texas)**: $100 minimum · Scheduled routes · No Express.
- **Delivery Promise**: Pickup and delivery are free across all active zones; distance economics are protected via zone minimums.

### C. 24-Hour Express ("Match-Ready Tomorrow")
- **Promise**: Picked up in morning window (8 AM – 11 AM), delivered next morning window.
- **Operating Window**: Mon–Fri pickup days only. 7 AM daily cutoff for same-day morning pickup; 9 PM cutoff for next-morning pickup.
- **Pricing**: +50% surcharge on order subtotal; minimum $15 surcharge floor. Whichever is greater. Surcharge is subject to sales tax (8.25%) and 3% environmental fee.
- **Item Exclusions**: Leather, suede, wedding/formal gowns, rugs, and specialty alterations are excluded. If an excluded item is added, Express is instantly disabled with clear customer notification.

### D. Roles & Access Control
- Supported roles: `customer`, `staff`, `admin`, `driver`, `intake_staff`.
- Mission Control routes (`/mission-control`, `/admin`) require `admin` or `staff` role.
- Drivers have dedicated mobile-friendly route views (`/staff/driver`).
