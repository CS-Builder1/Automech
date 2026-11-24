# Automech

Automech is an offline-first repair shop app for the web. Install the production PWA to keep working on the same device when the network drops.

## Run locally

Use Node.js 24 and npm from the repository root.

```sh
npm ci
npm run dev
```

Run `npm run build` and `npm run preview` to serve the production build with its offline service worker.

## Run a shop day

- Start at **Home → New job** for a walk-in. Add the customer and vehicle during intake, or use **Find vehicle or job** to retrieve an existing record by plate, VIN, phone or repair order.
- Open **Schedule** to book a bay, check pickups, contact customers, and receive parts. The repair order holds technician assignments, inspection findings, estimates and versioned customer approvals.
- On a completed repair order, use **Issue invoice**. Record a deposit or payment when the shop receives the money. **Billing** provides receipts, outstanding balances, expenses and a daily CSV. Manual payment entries record an external transaction.
- Use **Settings → Backup and restore** to download shop records and restore them in another browser. Store backups securely. The primary database lives in this browser profile.

## Verify changes

```sh
npm test
```

This runs the TypeScript checks, builds the PWA, then exercises shop records, approvals, billing, scheduling, accessibility, offline operation and backup recovery. Tests use disposable browser profiles. Install Chromium and set `CHROMIUM_PATH` to its executable if it differs from `/usr/bin/chromium`. The VIN journey supplies sample NHTSA responses to test both decoding and an unavailable service.

See [the product roadmap](ROADMAP.md) for longer-term plans.
