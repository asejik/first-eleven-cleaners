# FIRST ELEVEN CLEANERS — PROJECT CONTEXT FILE
# ================================================
# This file is the single source of truth for the entire build.
# Read this at the start of every session. Update it as decisions change.
# Last updated: August 20, 2026

## PROJECT IDENTITY
- **Project:** First Eleven Cleaners Web Application
- **Type:** PWA (Progressive Web App) — no native app at launch
- **Business:** AI-augmented dry cleaning & laundry pickup-and-delivery service
- **Location:** Dallas-Fort Worth Metroplex, Texas, USA
- **Operator:** Lydia Painting, LLC (d/b/a First Eleven Cleaners)
- **Founder:** Idowu Itiola, Ph.D., PMP, LEED AP BD+C
- **Heritage:** Served FIFA World Cup 2026 International Broadcast Centre in Dallas
- **Certifications:** MBE, SDVOSB, Texas Veteran-HUB, DBE, NCTRCA, NMSDC

## THE BAR
"The Uber of dry cleaning and laundry — a product so customer-obsessed it sells itself."

## 5 SIGNATURE FEATURES (Protected — Never Cut)
1. **Eleven** — Named AI concierge with memory, books by conversation, multilingual, human handoff
2. **See It Then Pay It** — Weigh-then-charge with itemized photo receipt BEFORE charge lands
3. **Garment Passport** — Customer-visible intake/return photos, condition history, cleaning count
4. **48-Hour Match-Ready Tracker** — 6 named stages, live countdown, Uber-style delivery ETA
5. **Smart Coverage** — Any DFW address books Day 1; zones earn density-based service days; never a rejection

## THE 6 STATUS MESSAGES (These ARE the product)
1. Booked
2. Picked Up
3. Weighed & Itemized (with photos + price)
4. In Cleaning
5. Out for Delivery (with driver ETA)
6. Delivered (with delivery photo)

Every status change triggers a customer message (SMS/WhatsApp + in-app).

## THREE EXPERIENCES, ONE DATA SPINE
1. **Customer App** — Book, track, pay, view Garment Passport, talk to Eleven
2. **Business Portal** — Commercial accounts: team programs, monthly invoicing, SLA visibility
3. **Mission Control** — Internal ops: live order board, route manifest, intake queue, KPI bar

## TECH STACK (Confirmed)
| Layer            | Technology                  | Tier        |
|------------------|-----------------------------|-------------|
| Framework        | Next.js 15 (App Router)     | Free        |
| Language         | TypeScript                  | Free        |
| Styling          | CSS Modules + CSS Variables | Free        |
| Server State     | TanStack Query v5           | Free        |
| Client State     | Zustand                     | Free        |
| Database + Auth  | Supabase (PostgreSQL)       | Free -> Pro |
| Payments         | Square Web Payments SDK     | Per-txn     |
| Messaging        | Twilio (SMS + WhatsApp)     | Pay-as-go   |
| Email            | Resend                      | Free tier   |
| Hosting          | Netlify                     | Free tier   |
| Maps             | Leaflet + OpenStreetMap     | Free        |
| AI/LLM           | Claude API (for Eleven)     | Pay-as-go   |
| Analytics        | Umami (self-hosted) or defer| Free        |
| Version Control  | GitHub                      | Free        |

## BRAND DESIGN SYSTEM
| Token       | Value                              |
|-------------|------------------------------------|
| Navy        | #0B1F3A (primary)                  |
| Gold        | #C9A14A (accent)                   |
| Pitch Green | #1E5B3A (secondary)                |
| Cream       | #F4F2EC (surfaces)                 |
| Headers     | Archivo Black or Inter Bold        |
| Body        | Inter                              |
| Accessibility | WCAG AA minimum                  |
| Modes       | Light only for MVP; Dark in Phase 4|
| Motion      | Soccer-ball spin loader; premium micro-interactions |
| Feel        | Five-star service. Premium, confident, warm. |

## PRICING STRUCTURE (Published — Non-Negotiable Transparency)
### Dry Cleaning (per garment)
| Garment                         | Price   |
|---------------------------------|---------|
| Shirt / Blouse (dry clean)      | $8.97   |
| Laundered shirt                 | $4.47   |
| Pants / Skirt / Shorts / Vest   | $8.97   |
| Dress                           | $14.97  |
| Tie / Scarf                     | $7.77   |
| Sweater                         | $11.97  |
| Jacket                          | $14.97  |
| Overcoat                        | $20.97  |
| Jumpsuit                        | $17.97  |
| Formal dress                    | $23.97  |

### Wash-and-Fold
- $3.00 per pound
- 15-pound minimum ($45 order floor) — MUST be visible before checkout
- Express: +25% (under 8 hours), +40% (under 4 hours) — toggled OFF until plant confirms

### Payment Architecture
- Dry cleaning: Fixed menu prices, charged at booking confirmation
- Wash-and-fold: Card stored (Square vault, delayed capture); weighed at intake; itemized ticket with photos; THEN charge
- Card on file: After first order, invisible checkout (Uber model)
- Business accounts: Consolidated monthly invoicing (PDF via email)

## SCHEDULING
- Pickup windows: Morning (7:30-10:00 AM), Evening (5:00-8:00 PM)
- Processing promise: 48 hours from pickup to delivery (Match-Ready)
- Operating days: Monday-Saturday; Sunday dark
- Express tiers: Built into code, toggled off until plant capacity confirmed
- Slot engine: Fully configurable per day
- Contactless: Default. Leave-at-door with photo confirmation both directions.

## SERVICE AREA
- No ZIP fences. Any DFW address can book.
- Dense zones -> daily service. Emerging zones -> scheduled service days.
- Every booking gets a committed window, never a rejection.
- Demand heat map in Mission Control shows where to deploy next.

## RESOLVED HARD QUESTIONS
| # | Question | Decision |
|---|----------|----------|
| HQ1 | Plant integration | Manual. Staff enters status in Mission Control. |
| HQ2 | Driver device | Personal phones. Mobile-optimized staff PWA view. |
| HQ3 | Who does intake? | Driver picks up. Weighing + photos at central hub by staff. |
| HQ4 | Eleven LLM cost | Acceptable. Claude Haiku for routine, Sonnet for complex. ~$30-150/mo. |
| HQ5 | Commercial invoicing | PDF generated from app and emailed monthly. No accounting integration. |
| HQ6 | Same as last time | Pre-fills booking form with last order details. Customer adjusts before confirming. |
| HQ7 | Delivery photo | Driver takes photo via staff PWA view. Customer doesn't confirm; photo is proof. |
| HQ8 | Dark mode | Phase 4. CSS Variables architecture from Day 1 for easy swap. |
| HQ9 | Logo SVG | Derive from flyer images. Recommend client gets professional vector logo. |
| HQ10 | Loading animation | CSS animation (spinning soccer ball). Lottie upgrade in polish phase. |
| HQ11 | Subscription billing | Per-pickup with subscription discount (10-15% off). |
| HQ12 | Square catalog | Client updates in Square Dashboard. App reads via API. |
| HQ13 | Languages | English + Spanish. Eleven responds in customer's language. i18n from Day 1. |
| HQ14 | Review generation | Yes. Post-delivery email with Google Business Profile review link, 2hrs after delivery. |

## DATABASE SCHEMA (Core Tables)
- customers
- customer_preferences
- addresses
- zones
- orders
- order_items
- order_events
- garment_photos
- time_slots
- promo_codes
- commercial_accounts
- staff
- conversations
- error_logs

## KEY API ROUTES
- /api/auth/* — Supabase auth
- /api/orders — CRUD orders
- /api/orders/[id]/status — Update status
- /api/orders/[id]/photos — Garment photos
- /api/bookings — Create booking, check slots
- /api/bookings/repeat — Same as last time
- /api/slots — Available time slots
- /api/pricing — Price calculator
- /api/payments — Square processing
- /api/payments/webhook — Square webhooks
- /api/notify — Trigger notifications
- /api/twilio/webhook — Inbound messages for Eleven
- /api/eleven — Eleven AI endpoint
- /api/claims — Make It Right claims
- /api/admin/* — Dashboard, zones, slots
- /api/commercial/* — Commercial accounts

## KEY PAGE ROUTES
- / — Landing page
- /pricing — Price card + live calculator
- /book — Multi-step booking
- /track/[orderId] — Public order tracking (no login, linked from SMS)
- /login, /signup — Auth
- /dashboard — Customer portal
- /dashboard/orders/[id] — Order detail with tracker + photos
- /dashboard/preferences — Eleven's memory (customer prefs)
- /commercial — Commercial inquiry page
- /portal — Business Portal [Phase 4]
- /mission-control — Ops dashboard [Phase 2]
- /mission-control/intake — Weigh, photo, itemize
- /staff/driver — Mobile driver view

## COMPETITIVE BENCHMARKS
- Uber: Live ETA, invisible payments
- Dominos: 6-stage tracker
- Chewy: Refund-first culture (Make It Right)
- Carvana: Condition documentation (Garment Passport)
- Amazon: Same as last time, delivery photo
- Starbucks: Loyalty loop, stored preferences
- Rinse: Subscription with skip/pause
- Poplin: Booking simplicity (3 taps)

## WHAT WE DO NOT BUILD
- Gig marketplace
- Physical lockers
- Native mobile apps (at launch)
- Feature parity with Rinse
- Same-day express before plant confirms
- ZIP code fences

## BUILD PRINCIPLES (Non-Negotiable)
1. Every price visible before checkout, always.
2. Every status change triggers a customer message.
3. Eleven must be RIGHT before MAGICAL. Guided flows first.
4. Free tiers first. Inform client before any paid upgrade.
5. If we hit trouble, client is informed. No silent failures.
6. The 5 signatures are protected. Supporting features flex.

## TIMELINE (14 Weeks)
- Phase 1: Foundation + Customer App (Weeks 1-5)
- Phase 2: Mission Control + Messaging (Weeks 5-8)
- Phase 3: Eleven + Garment Passport (Weeks 8-11)
- Phase 4: Business Portal + Polish (Weeks 11-14)
