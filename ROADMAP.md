# Automech — Build Roadmap

Mobile-first, **offline-first** shop management for solo & small auto repair shops.
One codebase → web (PWA) → iOS App Store & Google Play (Capacitor) → desktop.

## Why this stack

| Goal | Choice |
|------|--------|
| Test instantly, anywhere | **React + TypeScript + Vite** as an installable **PWA** |
| App Store + Play Store from one codebase | **Capacitor** wraps the same web build into native binaries |
| Desktop | Installable PWA today; Electron/Tauri shell later if needed |
| **Offline-first** (the #1 differentiator) | **Dexie / IndexedDB** is the on-device source of truth |
| Cloud sync, auth, storage, photos | **Supabase** (added in Sprint 6) |
| Fast mobile UI | **Tailwind CSS**, bottom-nav on phones / sidebar on desktop |

**Principle from the research:** give away the *organizational wedge* (CRM, ROs,
estimates, invoices, VIN decode, offline) generously; monetize *scale & structure*
(unlimited volume, DVI depth, reminders, online booking, payments) in Pro; monetize
*teams* (roles, dispatch, API) in Enterprise. No annual lock-in — ever.

---

## Sprint plan

Each sprint ends in something you can install and test.

### ✅ Sprint 1 — Foundation + Customer/Vehicle CRM  *(this build)*
- Project scaffold, PWA, offline service worker, responsive app shell.
- **Offline-first data layer** (Dexie) — full domain model defined up front.
- Customer CRM (add/edit/search/delete, soft-delete).
- Vehicle records (one customer → many vehicles).
- **NHTSA vPIC VIN decode** → auto-fills year/make/model/trim/engine, cached for offline.
- Shop settings: profile, **multi-currency** (billing + pegged display, e.g. USD/XCD @ 2.70), default labor/tax/markup/supplies rates.
- Dashboard with live counts; online/offline indicator.

### ✅ Sprint 2 — Work Orders, Estimates & Approval capture  *(this build)*
- Repair Order lifecycle (estimate → awaiting approval → approved → in progress → awaiting parts → QC → completed → invoiced) with status filters.
- Itemized line items: **labor (flat-rate vs actual hrs), parts, sublet, fees, discounts**; live totals (subtotal, shop supplies, tax, gross-profit insight).
- Parts status workflow (needed → quoted → ordered → received) + your-cost & one-tap markup.
- **Estimate authorization audit trail** — who authorized, when, how, amount cap; **e-signature capture**. Automatic re-authorization warning when the total exceeds the approved cap (>10% = hard re-approval prompt — the dispute-proofing requirement).
- Declined/deferred work moved off the RO and stored for later follow-up.
- Autosaves every field to the offline store; jobs surfaced on the customer record.
- Verified end-to-end (headless Chromium): create→line items→totals→approval→re-auth guardrail→persistence across reload.

### ✅ Sprint 3 — Invoices & Payments (incl. **PayPal**)  *(this build)*
- Convert RO → itemized **Invoice** (distinct, linked doc) with a line-item snapshot; RO auto-moves to "Invoiced".
- Itemized invoice with subtotal / shop supplies / tax / total and live balance due.
- **Cash/manual payment recording as a first-class option** (dominant locally) — works fully offline.
- Deposits & partial payments; balance recomputes; invoice flips to "Paid" automatically.
- **Pluggable payment-provider layer** (`src/payments/providers.ts`): cash, card-in-person, bank transfer, **Stripe**, **PayPal**, **WiPay**, **First Atlantic Commerce**. Gateways declare an `initiateCheckout` hook that stays "record manually" until live keys are configured — the UI and schema already accommodate them.
- **Printable invoice** (browser Print / Save-as-PDF with a clean print stylesheet) + **Share** (Web Share API / clipboard fallback).
- Invoices tab, outstanding-revenue dashboard stat, and per-customer invoice access.
- Verified end-to-end (headless Chromium): job → invoice → deposit → partial balance → paid → persistence, zero console errors.

### ✅ Sprint 4 — Digital Vehicle Inspection (DVI)  *(this build)*
- Templated **30-point checklist** grouped by category, with **green/yellow/red** ("Good/Soon/Now") ratings and a live G/Y/R tally.
- **Camera photo capture** per item (`capture="environment"`), auto-downscaled and stored as blobs in IndexedDB so it works fully offline; photos render via object URLs and are freed on delete.
- Per-item notes.
- **Findings flow to the estimate** — one tap adds a yellow/red finding (with its note) as recommended labor on the linked RO; the item is marked "✓ on estimate".
- Inspections surfaced on the work order with their rating summary; history kept per vehicle.
- Verified end-to-end (headless Chromium): template render → red rating → photo upload/render → finding-to-estimate → persistence, zero console errors.
- *Deferred to a later pass:* video capture, custom templates, and "snap a paper invoice" import.

### ✅ Sprint 5 — Scheduling, Reminders & Follow-up  *(this build)*
- **Appointment schedule** with a day agenda (prev/next/today), duration, optional customer/vehicle/job links, and **bay-based double-booking conflict** warnings.
- **Service / inspection / custom reminders** — time- *and* mileage-based; overdue highlighting; mark-done.
- **Declined-work follow-up worklist** — surfaces every RO with declined work (and its lost value) so you can win it back; one-tap **dismiss** when handled.
- **Tap-to-Call / Text / WhatsApp** from reminders and declined work, with pre-filled, editable messages (device deep links — live two-way Twilio SMS lands with the backend in Sprint 6).
- Home dashboard is now a hub: today's appointments, outstanding total, and a "follow-ups waiting" card.
- Nav restructured: Schedule promoted to the bottom bar; Settings/Follow-ups in the mobile header and desktop sidebar.
- Verified end-to-end (headless Chromium): appointment + conflict, Home surfacing, declined-work worklist + SMS link, reminder, dismiss, persistence — 11/11, zero console errors.

### ✅ Sprint 6 — Cloud sync, Auth & multi-device  *(this build)*
- **Decoupled sync engine** (`src/sync/engine.ts`) — pull-then-push, last-write-wins by `updatedAt`, soft-delete aware. Decoupled from Dexie/Supabase via `LocalStore`/`SyncBackend` interfaces, so the merge logic is unit-tested against in-memory fakes (two simulated devices + both conflict directions + stale-write protection + idempotency: **11/11**).
- **Supabase backend adapter** — one generic, RLS-scoped `records` table (JSON per record) + a private `media` bucket for inspection photos. SQL migration in `supabase/migrations/0001_init.sql`.
- **Email-OTP auth** and a Cloud Sync card in Settings (sign in, last-synced, sync now, sign out); **background sync** on sign-in, window focus, and a 2-minute tick.
- **Config-gated**: with no `VITE_SUPABASE_*` env vars the app stays 100% offline and the card shows "not configured" — so nothing breaks until you connect a project.
- *Live multi-device sync requires connecting a Supabase project* (env vars + run the migration). The engine, adapter, auth, and migration are all in place and type-checked.

### ✅ Sprint 7 — Monetization, tiers & PayPal  *(this build)*
- **Free / Pro ($29) / Team ($79) tiers**, billed monthly, no lock-in (`src/billing/plans.ts`).
- **Entitlement gating** with live usage counting (`useEntitlements`): Free caps at 25 customers, 10 invoices/mo, 3 inspections/mo. Hitting a cap shows a graceful **upgrade prompt** (never a hard block) at the customer, invoice and inspection create points.
- **Plans page** with tier comparison, current-plan highlighting, live usage, and a Settings plan card. Prices shown in shop currency (USD, or pegged XCD).
- **Live PayPal (config-gated)**: subscription checkout on the Plans page and online card capture for invoice payments, via PayPal Smart Buttons. With no `VITE_PAYPAL_*` env the app shows "checkout not connected" and invoice PayPal falls back to manual recording — nothing breaks.
- Verified: plan entitlements unit test 10/10; e2e 8/8 (tiers render, paid-plan gated state, inspection cap → upgrade prompt → Plans); invoices regression green; zero console errors.
- *Note:* plan is set client-side on approval today; a PayPal-webhook → backend entitlement check is the recommended hardening. Stripe/MoR and region-aware billing remain optional future rails.

### Sprint 8 — Native packaging & store readiness
- Capacitor iOS + Android projects; camera/share/file plugins.
- App icons, splash, store listings, privacy nutrition labels.
- Desktop shell.

### Sprint 9+ — Adjacent verticals
- **Mobile-mechanic mode**: routes, travel fees, on-site signature/payment, service area.
- **Motorcycle** type + seasonal off-season reminder campaigns.
- **Fleet**: fleet-customer with many units + preventive-maintenance schedules / DVIR.
- US premium integrations: PartsTech/Nexpart, ProDemand (bring-your-own), CARFAX.

---

## Features I'm recommending *beyond* the research doc

These close gaps I noticed while modeling the data and flows:

1. **E-signature + authorization cap enforcement** — not just storing who approved, but actively blocking/flagging work that exceeds the approved amount (turns the legal requirement into an automatic guardrail).
2. **Audit log / change history** on estimates & invoices — timestamps for every status change; invaluable in a dispute.
3. **"Snap a paper invoice / VIN plate" camera import** — matches ARI and eases migration from paper.
4. **Dark mode** — garages are bright/glary; mechanics use phones one-handed with gloves. Already wired into the design system.
5. **Safe-area / one-handed mobile ergonomics** — big tap targets, bottom-nav, respects notches/home indicator.
6. **Local backup & CSV/PDF export** — trust + portability (no lock-in, a stated differentiator).
7. **Per-customer labor-rate & parts-markup overrides** and **tax-exempt** flag — already in the data model.
8. **Pegged secondary-currency display** (USD with XCD in parentheses) — already implemented.
9. **Quick actions from a record** — tap-to-call / tap-to-text the customer directly.
10. **Deferred-work revenue queue** — surface declined items across all customers as a follow-up worklist (recovers lost revenue).

## Open items needing your input

- **PayPal**: the payment layer is built so PayPal slots in as a provider driver. To wire the live integration in Sprint 3 I'll need your PayPal **client ID + secret** (sandbox first, then live) and which product you want — **Orders v2 / Smart Buttons** for one-off invoice payments, plus optional **Subscriptions** for recurring billing. Until then it appears as a selectable method that records the transaction reference manually.
- Confirm primary launch market (Saint Lucia/Caribbean first vs. global) — affects which payment rail we wire first.
