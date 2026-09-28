# Export recorded rewards

In **Activity → Accruals**, choose an asset filter and **Export CSV**. Choose
where to save the file in the Mac's standard save dialog. All matching recorded
intervals are included, including rows behind **Show earlier**. Filtering selects
rows; each exported row retains all three asset columns shown in the ledger.

The file contains observation start/end timestamps in UTC, interval type, exact
unrefined GODL, refined GODL and XAUt0 quantities, and the gross-accrual basis.
An empty amount means no increase was recorded for that asset, not zero earnings
or a zero balance. Catch-up intervals keep their original bounds across midnight.
No daily allocation, current USD valuation or net-profit calculation is added.

Wallet addresses, RPC URLs, keys, internal identities and notification read states
are excluded. Quantities and timestamps are still personal financial history;
review the file before sharing it. The app writes only to the location you choose.
This is an analysis export, not a backup or a file the app can restore.

Open the CSV in Numbers or import it into Excel. Decimal points are always `.`
and columns use commas. The file preserves every token decimal; for very large
amounts, import quantity columns as **Text** to avoid spreadsheet rounding.

## Implementation contract

- Capture the selected rows when Export is clicked, before later observations
  or filter changes. Export every matching row in chronological order.
- Encode only fixed headings/labels, validated timestamps and integer-derived
  decimal strings. Never emit arbitrary journal text or spreadsheet formulas.
- Reject empty, mixed-identity, duplicate, overlapping, reversed, future-dated or
  invalid-amount history. Failure and cancellation leave the journal untouched.
- Prepare away from the main thread; repeated clicks cannot start a second export.
- Use the native save dialog and an owner-readable/writable file wrapper. Existing
  destination replacement remains a native save-dialog decision.
- No schema migration, journal write, read acknowledgement, network request or
  new dependency. Removing this feature requires no user-data rollback.

Validation covers exact tiny/maximum quantities, missing values, cross-day
intervals, ordering, invalid history, privacy exclusions, file permissions and
native save/cancel/error behavior. See [accounting scope](accounting.md) for the
difference between recorded increases and verified net earnings.
