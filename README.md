# torn-spy-coordinator

`index.html` is the current operational board.

## Google Sheet ledger backend

`apps-script/Code.gs` is the Google Apps Script backend for using one Google Sheet as the operational ledger.

Setup:

1. Create/open the Google Sheet you want to use.
2. Extensions -> Apps Script.
3. Paste `apps-script/Code.gs`.
4. Set Script Properties: `API_KEY`, `ADMIN_KEY`, and optionally `MANAGER_DISCORD_WEBHOOK_URL` and `EMPLOYEE_DISCORD_WEBHOOK_URL`.

`MANAGER_DISCORD_WEBHOOK_URL` is used for completed order notifications. `EMPLOYEE_DISCORD_WEBHOOK_URL` is used for new order notifications. `DISCORD_WEBHOOK_URL` still works as a fallback if you only want one webhook.

Accepted webhook aliases:

- Manager: `MANAGER_DISCORD_WEBHOOK_URL`, `DISCORD_MANAGER_WEBHOOK_URL`, `MANAGER_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`
- Employee/new orders: `EMPLOYEE_DISCORD_WEBHOOK_URL`, `DISCORD_EMPLOYEE_WEBHOOK_URL`, `EMPLOYEE_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`
5. Deploy as Web App.
6. Use the Web App URL as `DEFAULT_API` in `index.html` or keep the existing URL if that deployment is updated.

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

This is payment tracking only. It does not process real payments.
