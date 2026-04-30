# torn-spy-coordinator

`index.html` is the current operational legacy board.

`portal.html` is the finished local multi-firm portal MVP.

`server.js` plus `src/` provide a real local backend using Express and SQLite.

## Portal Summary

`portal.html` includes:

- self-registration for sellers
- invite tokens for additional firm members
- multi-firm orders and target tracking
- manual spy submission with parsing and partial-spy warnings
- customer payments and seller payouts tracked separately
- seller approval queue
- Discord webhook notifications for completed orders
- optional API consent storage for future automation work
- local export/import/reset tools for browser-stored data

## Demo Accounts

- `admin@spyportal.local` / `admin123`
- `coord@spyportal.local` / `coord123`
- `client@helsing.local` / `client123`

## Important Limitation

The frontend portal still stores its own browser-local state unless it is explicitly wired to the backend. The new backend in this repo provides real persistence and auth locally, but the current `portal.html` has not yet been refactored to call those API routes automatically.

## Local Backend

Install dependencies and start the server:

```bash
npm install
npm start
```

The server will:

- create `data/portal.db`
- seed demo users and a demo order
- serve the static files from the repo root
- expose JSON API routes under `/api`

Useful routes:

- `POST /api/auth/login`
- `GET /api/bootstrap`
- `POST /api/register/seller`
- `POST /api/register/client`
- `POST /api/invites/accept`
- `POST /api/orders`
- `POST /api/items/:itemId/claim`
- `POST /api/items/:itemId/submit`
- `POST /api/payments`
- `PATCH /api/payouts/:payoutId/status`

This is now a proper local full-stack base, but it is still not a hardened production deployment. There is no refresh-token flow, RBAC audit layer, encrypted secrets vault, or live Torn API ingestion yet.
