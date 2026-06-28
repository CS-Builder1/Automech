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

### Sprint 2 — Work Orders, Estimates & Approval capture
- Repair Order lifecycle (estimate → awaiting approval → approved → in progress → awaiting parts → QC → completed → invoiced).
- Itemized line items: **labor (flat-rate vs actual hrs), parts, sublet, fees, discounts**.
- Parts status workflow (needed → quoted → ordered → received).
- **Estimate authorization audit trail** — who authorized, when, how, amount cap; **e-signature capture**. Re-authorization prompt when total exceeds the approved cap (the dispute-proofing requirement).
- Declined/deferred work stored on the RO for later follow-up.

### Sprint 3 — Invoices & Payments (incl. **Pebao**)
- Convert RO → itemized **Invoice** (distinct, linked legal/financial doc).
- Tax, shop-supply fees, per-customer overrides, warranty terms.
- **Cash/manual payment recording as a first-class option** (dominant locally).
- Deposits & partial payments.
- **Pluggable payment-provider abstraction**: cash, card-manual, **Stripe** (global), **WiPay** (Caribbean/XCD), **First Atlantic Commerce / Powertranz**, and **Pebao**. Each provider is a driver behind one interface so we can add rails per region.
- PDF/printable invoice + share link.

### Sprint 4 — Digital Vehicle Inspection (DVI)
- Templated checklist (30–100+ points), **green/yellow/red** ratings.
- **Photo/video capture** (camera) stored offline, synced later.
- Findings map to estimate line items; declined items → follow-up queue.
- "Snap a paper invoice / VIN plate" capture.

### Sprint 5 — Scheduling, Reminders & Follow-up
- Appointment calendar with bay/capacity awareness.
- Service/maintenance reminders (mileage + time based); state-inspection due dates.
- Declined-work follow-up campaigns (recover deferred revenue).
- Two-way SMS (Twilio) for approvals/reminders/"on my way".

### Sprint 6 — Cloud sync, Auth & multi-device
- Supabase auth (email/OTP).
- **Sync engine**: local-first ↔ cloud reconciliation, conflict handling, photo upload to object storage.
- Encrypted-at-rest customer PII; privacy policy; data export/backup.

### Sprint 7 — Monetization & tiers
- Free / Pro ($29/mo, no contract) / Enterprise tiers with entitlement gating.
- **Web checkout billing** (Stripe / merchant-of-record) to keep ~95%+ of revenue in US/EU; IAP only where legally required; entitlement sync (RevenueCat-style). Region-aware billing mode.
- "Caribbean Pro" pricing in XCD.

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

- **Pebao**: I've built the payment layer so Pebao slots in as a provider driver. To wire the live integration in Sprint 3 I'll need its merchant/API details (API base URL, auth/keys, whether it's a hosted redirect checkout or direct API, supported currencies, webhook/callback format). Until then it appears as a selectable method that records the transaction reference manually.
- Confirm primary launch market (Saint Lucia/Caribbean first vs. global) — affects which payment rail we wire first.
