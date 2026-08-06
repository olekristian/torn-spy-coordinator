# torn-spy-coordinator

`index.html` is the current operational board.

## Google Sheet ledger backend

`apps-script/Code.gs` is the Google Apps Script backend for using one Google Sheet as the operational ledger.

Setup:

1. Create/open the Google Sheet you want to use.
2. Extensions -> Apps Script.
3. Paste `apps-script/Code.gs`.
4. In Project Settings, enable the manifest file and copy `apps-script/appsscript.json` so the deployment explicitly requests Sheets, script properties, and external request access.
5. Set Script Properties: `API_KEY`, `ADMIN_KEY`, `EMPLOYEE_ACCESS_MAP`, and optionally `MANAGER_DISCORD_WEBHOOK_URL` and `EMPLOYEE_DISCORD_WEBHOOK_URL`.

`EMPLOYEE_ACCESS_MAP` must be a JSON object mapping each employee's private access code to their canonical display name. The shared `API_KEY` is read-only for employee actions; claiming, releasing, and submitting require a mapped personal code. Example:

```json
{"unique-code-for-kattemannen":"Kattemannen","unique-code-for-alice":"Alice"}
```

Use unique random codes, do not reuse `ADMIN_KEY`, and distribute each code only to its employee. Script Property changes take effect without creating a new deployment version.

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
