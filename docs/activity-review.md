# Activity ledger — 0.2.3

Activity now answers what accrued and what changed. It no longer lists every
successful refresh or repeats an unchanged balance.

- Today’s net uses the existing accounting interval, with a daily-breakdown link.
- A day-grouped accrual ledger shows unrefined GODL, refined GODL and gold.
  Asset filtering selects matching entries. Exact quantities and current USD
  estimates are available through native help and accessibility labels.
- Overnight catch-up intervals retain their full dates. They are not split into
  invented daily earnings. Missing and expired values remain unavailable.
- A separate balance-change ledger omits initial and unchanged observations.
  Movement details retain exact before/after balances, timestamps and slots.
- Overview shows the three latest accruals. Opening Activity does not mark
  notifications as read. Forty entries load initially, with Show earlier.

## Verification

Native synthetic checks on Apple Silicon / macOS 27 covered default and minimum
window widths, a 41-entry journal, asset filtering, pagination, overnight catch-up,
tiny quantities, unread-state preservation, the daily-breakdown sheet, positive
and negative balance movements, missing accounting, unreadable history, expired
quotes and the menu-bar widget. A 39-digit base-unit delta was checked in the native
detail sheet without Decimal rounding or truncation. No production data was used
in the preview.

64 Swift tests, 83 engine tests and 3 privacy-guard tests passed. The nine new
projection cases cover 10,000 unchanged observations, missing baselines, numeric
borrow, arbitrary-length exact deltas, chronology rewinds and duplicate IDs.
The release build, source/package privacy scans and local ad-hoc signature
verification passed. A rollback-backed installation preserved saved settings,
goals, accounting anchors, all existing observation rows and inbox read states;
fresh finalized observations resumed.

## Review disposition

One independent review found a P1 precision issue: the exact detail delta was
passing through Decimal formatting. It was corrected with direct string display,
a regression test and native verification. The focused recheck found no remaining
P0/P1 in the changed journey.

Deferred P2: after a system timezone change, a cached earnings day is selected in
its recorded accounting zone while its interval is displayed in the current
system zone. The accounting-zone help text remains available; a successful fresh
observation updates the accounting zone. This does not change the amounts.

The journal is an observed history, not a complete transaction index or an income
ledger. Original source observations stay in the local database. No accounting,
reward detection, persistence schema, notification acknowledgement or transaction
behavior was changed.
