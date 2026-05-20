# torn-spy-coordinator

`index.html` is the current operational legacy board.

`portal.html` is the finished local multi-firm portal MVP.

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

This repo still has no real backend. `portal.html` is a browser-based local MVP that stores data in local storage on the current machine and browser profile. It does not provide secure production authentication, encrypted server-side key storage, or live Torn log automation.
