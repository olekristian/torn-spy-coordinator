# torn-spy-coordinator

`index.html` is the current operational board.

## Google Sheet ledger backend

`apps-script/Code.gs` is the Google Apps Script backend for using one Google Sheet as the operational ledger.

Setup:

1. Create/open the Google Sheet you want to use.
2. Extensions -> Apps Script.
3. Paste `apps-script/Code.gs`.
4. In Project Settings, enable the manifest file and copy `apps-script/appsscript.json` so the deployment explicitly requests Sheets, script properties, and external request access.
5. Set the required Script Properties: `TORN_COMPANY_ID` and `ADMIN_KEY`. `TORN_COMPANY_ID` must be the numeric company ID from the Torn company page URL (`joblist.php#/p=corpinfo&ID=12345` means `12345`), not the company type ID. Optionally set `TORN_SESSION_HOURS` (default 8, maximum 24), Discord webhook properties, and the legacy `API_KEY` / `EMPLOYEE_ACCESS_MAP` properties.

## Employee sign-in with Torn

Employees sign in with their own Torn API key. The backend calls Torn's public identity and company employee endpoints, verifies that the Torn ID belongs to `TORN_COMPANY_ID`, and returns a short-lived signed session. Claims and submissions are owned by Torn ID, so a typed or changed display name cannot impersonate another employee.

The raw Torn key is not written to Sheets, Script Properties, or persistent browser storage. It is sent to Apps Script once during sign-in and retained only in the current browser session for optional direct Torn report lookup. The short-lived signed employee token is retained on the device until its server-defined expiry (8 hours by default, configurable up to 24 hours) or explicit sign-out, so ordinary page refreshes and browser restarts do not require another Torn login. `SESSION_SECRET` is generated automatically the first time an employee signs in; you may set it yourself to a long random value before first use.

Employees should use a narrowly scoped Custom key and must not use a Full Access key. Sign-in explicitly requests `key → info` and `user → profile`; key info verifies Torn ID and company membership. Optional report lookup additionally requires `user → reports`. Signing out removes the key and employee session from that browser session.

### Manager-assisted submissions

An authenticated manager can open a target card, expand **Submit on behalf of a company member**, enter the member's canonical display name, paste and review the spy result, and submit it. Existing target assignments or claims must match the selected member. The submission records the member in `submittedBy` for work and payout attribution, while `enteredBy` and `submissionMode=manager_assisted` preserve who entered it and how. The audit log records `manager_submitted_for_employee`; managers should never use or request another member's API key.

### Legacy employee codes (optional fallback)

`EMPLOYEE_ACCESS_MAP` must be a JSON object mapping each employee's private access code to their canonical display name. The shared `API_KEY` is read-only for employee actions; claiming, releasing, and submitting require a mapped personal code. Example:

```json
{"unique-code-for-kattemannen":"Kattemannen","unique-code-for-alice":"Alice"}
```

If you retain this fallback, use unique random codes, do not reuse `ADMIN_KEY`, and distribute each code only to its employee. Script Property changes take effect without creating a new deployment version.

`MANAGER_DISCORD_WEBHOOK_URL` is used for completed order notifications. `EMPLOYEE_DISCORD_WEBHOOK_URL` is used for new order notifications. `DISCORD_WEBHOOK_URL` still works as a fallback if you only want one webhook.

Accepted webhook aliases:

- Manager: `MANAGER_DISCORD_WEBHOOK_URL`, `DISCORD_MANAGER_WEBHOOK_URL`, `MANAGER_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`
- Employee/new orders: `EMPLOYEE_DISCORD_WEBHOOK_URL`, `DISCORD_EMPLOYEE_WEBHOOK_URL`, `EMPLOYEE_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`
6. Save the project, then run any function once from the Apps Script editor and accept the authorization prompt. This is required before Discord webhook notifications can call `UrlFetchApp.fetch`.
7. Deploy as Web App, or create a new version if the project was already deployed so the updated scopes are included.
8. Use the Web App URL as `DEFAULT_API` in `index.html` or keep the existing URL if that deployment is updated.

The script creates these tabs automatically:

- `Targets`
- `Submissions`
- `Orders`
- `Customers`
- `Employees`
- `CustomerPayments`
- `EmployeePayouts`
- `AuditLog`
- `DeliveryHistory`
- `Outbox`

## Paying an employee for an order

In **Manager → Payments**, use **Pay employee in full for order** when settling all of one employee's approved work in an order. Enter the employee display name and Order ID; the backend finds the matching approved submissions, calculates each target's remaining employee rate, and records the payout against those targets. Existing paid amounts are deducted and queued amounts are converted to paid, so managers do not need to look up target IDs. Payout references default to the standardized message `For X spies` (`For 1 spy` for a single target), while still allowing a custom replacement. The single-target payout action remains available for corrections and partial payments.

## Cancelling an order

Verified managers can cancel an active order from the Manager order card.
Cancellation is deliberately non-destructive:

- the order and its targets are marked `cancelled`;
- targets disappear from active spy views for employees and managers;
- claims and assignments are cleared;
- submissions, payments, payouts and audit history are retained;
- pending/failed Outbox events are stopped;
- ambiguous Discord outcomes remain `unknown` for manual reconciliation;
- delivered or closed orders cannot be cancelled.

The `Orders` schema adds `cancelledAt`, `cancelledBy`, `cancelReason`, and
`cancelOperationId`. Deploy the updated backend before the frontend so
`ensureSheets_()` can append these fields safely.

This is payment tracking only. It does not process real payments.
