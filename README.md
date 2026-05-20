# torn-spy-coordinator

`index.html` is the current operational board.

## Google Sheet ledger backend

`apps-script/Code.gs` is the Google Apps Script backend for using one Google Sheet as the operational ledger.

Setup:

1. Create/open the Google Sheet you want to use.
2. Extensions -> Apps Script.
3. Paste `apps-script/Code.gs`.
4. Set Script Properties: `API_KEY`, `ADMIN_KEY`, and optionally `DISCORD_WEBHOOK_URL` for manager phone/channel notifications.
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
