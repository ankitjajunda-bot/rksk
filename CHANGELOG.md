# Changelog

All notable changes to the Ram Kisan Sewa Kendra (RKSK) Dashboard will be documented in this file.

## [1.1.0] - 2026-06-28

### Security
- **Hardcoded Token Removal**: Removed the hardcoded fallback GitHub Personal Access Token (PAT) and Gist ID from the frontend codebase (`app.js`). Config credentials now live exclusively in client-side secure `localStorage`.
- **First-Time Setup Flow**: Implemented a global alert banner prompting the user to configure Gist credentials under settings upon first load when no configuration is detected.

### Fixed
- **Commission Rendering Bug**: Fixed a `ReferenceError: total_commission is not defined` inside `computeLedgerRow()` that caused dashboard summary cards to render as `₹ 0.00` and ledger tables to fail loading.
- **Spreadsheet Renderer Crash**: Fixed a `ReferenceError: deliv is not defined` in `renderDsrChecker()` that prevented the DSR spreadsheet from rendering.
- **Paid Date Parsing**: Handled date formats gracefully to fix the `Invalid Date` rendering issue inside Tanker Purchase history.
- **Cash Flow Display**: Fixed double currency symbols (`₹₹`) displaying in the cash flow forecast table.

### Added
- **Manual Cloud Refresh**: Added a dedicated green **Refresh** button in the header toolbar to fetch the latest cloud Gist database without requiring a hard reload or service worker clearing.
- **Offline Mode & Banner**: Implemented live detection of offline/online state. A warning banner alerts the user when they are offline, indicating that all edits will save locally in offline queue mode. 
- **Auto-Sync on Reconnect**: Added network events that automatically sync queued local changes with the Gist database when the device comes back online.
- **Print View Styling**: Added a full `@media print` print-media stylesheet in `styles.css` that strips sidebar navigation, buttons, and headers, outputting clean, full-width reports.
- **Browser Tab Custom Title**: Tab title now updates dynamically on launch to show the current date, e.g., `RKSK Pump Dashboard — 28 Jun 2026`.
- **Quick Help Guide**: Integrated a collapsible quick help panel in the sidebar footer explaining the fundamentals of reading submission, stock reconciliation, and offline sync.
- **Spreadsheet Header Tooltips**: Unfamiliar or complex columns (e.g. Tests, Wetstock Dip, Variance, Expected Rev) now display detailed descriptions when hovered over.
- **Rate Limit Tracking**: Captured the GitHub Gist API remaining requests header (`x-ratelimit-remaining`) to warn users with a banner if API request limits run low (<10 remaining).
