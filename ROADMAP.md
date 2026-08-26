# FIRST ELEVEN CLEANERS — 14-WEEK PHASED ROADMAP & TODO LIST
================================================================

> **Single Source of Progress Tracking for First Eleven Cleaners**  
> *Last Updated: August 23, 2026*  
> **Brand & Operator:** Lydia Painting, LLC (d/b/a First Eleven Cleaners) • Dallas, Texas  
> **Status:** Phase 1 Core Foundation Complete / Phase 2 Next in Queue

---

## 📊 High-Level Roadmap Overview

| Phase | Focus Area | Timeline | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Foundation + Core Customer PWA | Weeks 1–5 | 🟢 **Complete** |
| **Phase 2** | Mission Control Ops + Twilio/WhatsApp Messaging | Weeks 5–8 | 🟢 **Complete** |
| **Phase 3** | "Eleven" AI Concierge + Garment Passport Vision | Weeks 8–11 | 🟢 **Complete** |
| **Phase 4** | Commercial Business Portal + Production Polish | Weeks 11–14 | 🟢 **Complete** |

---

## 🟩 Phase 1: Foundation + Core Customer PWA (Weeks 1–5)
*Goal: Establish brand design system, full PostgreSQL database schema, customer booking, transparent pricing, and public order tracking.*

### 1.1 Architecture & Design System
- [x] Create project identity, tech stack, and single source of truth (`PROJECT_CONTEXT.md`)
- [x] Configure Design Tokens (`Navy #0B1F3A`, `Gold #C9A14A`, `Pitch Green #1E5B3A`, `Cream #F4F2EC`)
- [x] Setup global typography (`Archivo` / `Inter`), CSS resets, and responsive scales
- [x] Build reusable UI component library:
  - [x] `Button` (with `primary`, `secondary`, `outline`, `outlineLight`, `ghost`, `ghostLight`, `danger`)
  - [x] `Card` (surface, bordered, elevated)
  - [x] `Badge` (with order status variants and live dot indicator)
  - [x] `Input` (floating labels, icons, error states, helper texts)
  - [x] `Modal` (focus management, backdrop blur, sizes)
  - [x] `Toast` notification system & provider
  - [x] `Loader` & soccer-ball loading animation
- [x] Build application layout header with responsive navigation and mobile drawer
- [x] Build brand footer with credentials (`MBE`, `SDVOSB`, `Veteran-HUB`, `DBE`) and quick links
- [x] Audit UI contrast and WCAG AA accessibility across light and dark contexts

### 1.2 Database & Supabase Spine
- [x] Define PostgreSQL schema (`15 Core Tables`)
  - [x] `zones` (DFW smart coverage)
  - [x] `customers` & `customer_preferences` ("Eleven's Memory")
  - [x] `addresses` (customer delivery addresses with zone mapping)
  - [x] `orders` & `order_items`
  - [x] `order_events` (6-stage timeline audit log)
  - [x] `garment_photos` (Garment Passport & delivery photos)
  - [x] `time_slots` (rolling pickup/delivery windows)
  - [x] `promo_codes` (`KICKOFF15`, `MATCHREADY`, `WELCOME5`)
  - [x] `commercial_accounts`
  - [x] `staff` & `conversations`
  - [x] `claims` ("Make It Right" refund/replace tracking)
  - [x] `error_logs`
- [x] Add automated `update_timestamp_column` triggers
- [x] Add auto-sync trigger on `auth.users` (`on_auth_user_created`)
- [x] Configure Row-Level Security (RLS) policies for customers and public data
- [x] Build seed scripts (`seed.sql`) for DFW zones, promo codes, and 14-day rolling slots
- [x] Setup Supabase Storage buckets (`garment-photos`, `claims-photos`)

### 1.3 Customer Experience & Core Routes
- [x] **Homepage (`/`)**:
  - [x] High-contrast promo banner (`KICKOFF15` campaign)
  - [x] Hero section with FIFA 2026 World Cup IBC heritage badge
  - [x] "Starting Lineup" 3-step explainer
  - [x] Service cards (Dry Cleaning, Wash & Fold, Pickup & Delivery, Express)
  - [x] Trust section & World Cup Vendor Performance credentials
  - [x] Bottom call-to-action section
- [x] **Transparent Pricing Page (`/pricing`)**:
  - [x] Published rate cards (Dry Cleaning per-garment menu & Wash-and-fold $3/lb)
  - [x] 15-lb published minimum disclosure ($45 floor)
  - [x] Interactive live estimator calculator with real-time price breakdown
- [x] **5-Step Booking Flow (`/book`)**:
  - [x] Step 1: Customer Info & DFW Address Verification
  - [x] Step 2: Garment & Service Selection (Dry Clean items + Wash & Fold weight)
  - [x] Step 3: Date & Pickup Window Picker (Morning 7:30–10AM / Evening 5–8PM)
  - [x] Step 4: Review, Promo Code Engine (`/api/promo/validate`), and Summary
  - [x] Step 5: Secure Payment Capture / Square Card on File
  - [x] Step 6: Confirmation Screen with instant Order Number & Live Tracker Link
- [x] **Live Order Tracker (`/track/[orderId]`)**:
  - [x] Public access from SMS/WhatsApp (no forced login)
  - [x] Visual 6-Stage Domino's-style tracker
  - [x] Live 48-Hour countdown badge
  - [x] Direct link to "Make It Right" claim resolution
- [x] **Customer Dashboard (`/dashboard`)**:
  - [x] Active orders list and order history
  - [x] Order detail page (`/dashboard/orders/[id]`) with live events and Garment Passport photos
  - [x] Customer Preferences page (`/dashboard/preferences`) for starch, folding, and detergent
  - [x] Saved Addresses management (`/dashboard/addresses`)
- [x] **Customer Authentication (`/login`, `/signup`, `/forgot-password`)**:
  - [x] Supabase Auth integration with local mock fallback
  - [x] Form validation with Zod and React Hook Form
- [x] **"Make It Right" Claims (`/claim/[orderId]`)**:
  - [x] Chewy-style resolution intake for damage, lost items, or quality issues
- [x] **Commercial Inquiry Page (`/commercial`)**:
  - [x] Dedicated B2B intake for salons, med-spas, gyms, short-term rentals, and boutique hotels

---

## 🟩 Phase 2: Mission Control & Real-Time Messaging (Weeks 5–8)
*Goal: Internal operations dashboard, central intake weighing/photo station, driver mobile route manifests, and Twilio/WhatsApp 6-status messaging pipeline.*

### 2.1 Mission Control Ops Board (`/mission-control`)
- [x] Ops Dashboard overview: Live orders count, orders by stage, revenue today, pending pickups
- [x] Order management Kanban list with filtering by zone, status, pickup date, and customer
- [x] Quick status update buttons (triggers customer notifications)
- [x] Real-Time Labor KPI Bar (tracking labor $\le 32\%$ of net sales with threshold alerts)
- [x] "Make It Right" Admin Resolution Queue with refund & executive response modal

### 2.2 Central Intake Station (`/mission-control/intake`)
- [x] Rapid intake queue for incoming bags from drivers
- [x] Digital scale weight recording & itemized line-item tagging ($3/lb with $45 minimum floor)
- [x] Multi-angle photo upload station (front, back, care label, pre-existing stains)
- [x] Automatic "See It Then Pay It" itemized ticket generation & charge trigger

### 2.3 Driver Mobile Manifest & Proof of Delivery (`/staff/driver`)
- [x] Mobile-optimized PWA route view for drivers' personal phones
- [x] Pickup Manifest (address, gate code, morning/evening window, customer phone)
- [x] Delivery Manifest with map navigation links & click-to-call
- [x] In-app camera capture for:
  - [x] Pickup verification photo (contactless porch photo)
  - [x] Delivery proof photo (timestamped porch drop photo)

### 2.4 Twilio & WhatsApp Status Messaging Engine
- [x] Setup Twilio SMS & WhatsApp Business API templates & provider adapter
- [x] Implement the **6 Core Automated Status Messages**:
  1. *Booked* — Order confirmation + pickup window reminder
  2. *Picked Up* — Driver has bag + en route to hub
  3. *Weighed & Itemized* — Photo receipt + exact price before card capture
  4. *In Cleaning* — Garments in professional process
  5. *Out for Delivery* — Live driver ETA + estimated arrival time
  6. *Delivered* — Delivery photo confirmation + direct tracking link
- [x] Live SMS & WhatsApp Simulator HUD in Mission Control with audit feed

---

## 🟩 Phase 3: "Eleven" AI Concierge & Garment Passport (Weeks 8–11)
*Goal: Deploy named AI concierge with memory across Web/SMS/WhatsApp and full Garment Passport visual timeline.*

### 3.1 "Eleven" AI Concierge Engine
- [x] Integrate Claude API & Decoupled Smart Simulated AI Engine Provider (`IAIEngineProvider`)
- [x] System prompt engineering incorporating rate cards, DFW zones, and brand voice (`systemPrompt.ts`)
- [x] Persistent customer memory integration (reads `customer_preferences` & past orders)
- [x] Multilingual conversation handling (English & Spanish automatic detection)
- [x] Conversational booking flow via Web/SMS/WhatsApp ("Book my usual for Tuesday morning")
- [x] Smooth human escalation / staff handoff trigger to Mission Control Ops
- [x] Floating Eleven Concierge interactive drawer widget on all pages (`ConciergeWidget.tsx`)

### 3.2 "Garment Passport" Full Visual History
- [x] Customer-visible Garment Passport timeline inside `/dashboard/orders/[id]` (`GarmentPassportTimeline.tsx`)
- [x] Side-by-side Intake vs. Return photo comparison split view
- [x] High-resolution Lightbox Zoom modal with inspection & stain pre-treatment notes
- [x] Lifetime cleaning cycle counter & Match-Ready score verification
- [x] Pre-existing flaw protective banner (protecting customer and plant from disputed damage)

---

## 🟩 Phase 4: Business Portal, Growth & Production Polish (Weeks 11–14)
*Goal: Commercial B2B self-service portal, automated review generation, churn win-back, dark mode, and Netlify production deployment.*

### 4.1 Business / Commercial Portal (`/portal`)
- [x] Commercial account dashboard with multi-location account switcher (`/portal`)
- [x] Contract rate card visibility & SLA turnaround guarantees (`types.ts`, `index.ts`)
- [x] Monthly consolidated PDF statement viewer with itemized line items & Net-30 settlement
- [x] Dedicated property manager & corporate facility pickup schedule manager

### 4.2 Growth & Customer Retention Automations
- [x] Post-delivery review generation (automated SMS 2 hours post-delivery with Google Business Profile review link)
- [x] Churn scoring model & automated win-back discount triggers (`COMEBACK15`)
- [x] POS dry-cleaning attach recommendation engine at booking checkout

### 4.3 Polish, Performance & Production Launch
- [x] Unified Navy/Gold/Cream Design System with contrast & mobile responsiveness
- [x] High-resolution image zoom lightboxes & match-ready micro-interactions
- [x] Decoupled AI & messaging engine providers for seamless plug-and-play production launch
- [x] End-to-end multi-account browser workflow verification across all 33 routes

---

## 📌 Quick Commands & Reference
* **Local Web Server:** `cd web && npm run dev`
* **Production Build Test:** `cd web && npm run build`
* **Database Migration & Seed:** Run `web/supabase/schema.sql` and `web/supabase/seed.sql` in Supabase SQL Editor
