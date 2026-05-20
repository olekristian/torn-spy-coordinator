# torn-spy-coordinator

`index.html` is the current operational legacy board.

`portal.html` is the finished local multi-firm portal MVP.

`server.js` plus `src/` provide a real local backend using Express and SQLite.

`google-apps-script/Code.gs` provides a Google Sheets backend for GitHub Pages.

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
- order numbers and copy-ready results per order
- appending new targets to existing orders
- Google Sheets persistence when deployed through Apps Script

## Demo Accounts

- `admin@spyportal.local` / `admin123`
- `coord@spyportal.local` / `coord123`
- `client@helsing.local` / `client123`

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
- `POST /api/orders/:orderId/items`
- `POST /api/items/:itemId/claim`
- `POST /api/items/:itemId/submit`
- `POST /api/payments`
- `PATCH /api/payouts/:payoutId/status`

This is now a proper local full-stack base, but it is still not a hardened production deployment. There is no refresh-token flow, RBAC audit layer, encrypted secrets vault, or live Torn API ingestion yet.

## GitHub Pages + Google Sheets

`portal.html` can run as a static GitHub Pages page. For persistence, deploy
`google-apps-script/Code.gs` as a Google Apps Script Web App and use its `/exec`
URL as the portal API URL.

Deploy outline:

1. Create or open a Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste `google-apps-script/Code.gs` into `Code.gs`.
4. Deploy as a Web App with access set to the people who should use the portal.
5. Open `portal.html` from GitHub Pages and paste the Web App URL into `API URL`.

The same `portal.html` still uses `http://localhost:3000/api` automatically when
opened from the local Express server.
