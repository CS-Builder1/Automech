# Automech

Mobile-first, **offline-first** shop management for solo & small auto repair shops.
One codebase ships to web (PWA), iOS, Android and desktop.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173  — test in any browser, installable as a PWA
npm run build    # type-check + production build
npm run preview  # serve the production build
```

Open it on your phone's browser and "Add to Home Screen" to test the installed,
offline experience. Everything you enter is saved on the device first.

## What's in Sprint 1

- Customer & vehicle CRM (offline-first, on-device IndexedDB).
- **VIN decode** via the free NHTSA vPIC API (auto-fills year/make/model/engine).
- Shop settings with **multi-currency** (e.g. USD billed, XCD displayed at the 2.70 peg).
- Responsive shell: bottom-nav on phones, sidebar on desktop; light/dark.

See **[ROADMAP.md](./ROADMAP.md)** for the full sprint plan, the extra features
being recommended beyond the research, and the Pebao payment integration plan.

## Tech

React + TypeScript + Vite (PWA) · Dexie/IndexedDB (offline) · Tailwind CSS ·
Capacitor (native packaging, later) · Supabase (cloud sync, later).
