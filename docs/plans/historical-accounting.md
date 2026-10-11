# Recovering covered historical accounting

Owner-approved 11 October 2026 after 0.2.23. Recover the existing seven-day net
table from saved finalized observations inside already committed reconciliation
intervals. Preserve every journal row, reviewed anchor, checkpoint, ledger hash,
raw transaction and price record. Developer ID/notarization remain on hold.

## Contract

A long reconciliation proves cumulative costs but supplies only its endpoints to
the daily table. Actual saved observations inside that interval may provide the
missing historical boundaries. They do not establish a new starting balance.

Replay the complete saved interval with its original closed/funded/version cost
semantics. Its exact cash totals, fees, rent, historical-price numerator and
included/excluded signatures must reproduce the committed child from its actual
parent. Recover nothing from an absent parent, incomplete or mismatched record.
For each saved settled boundary, replay both transaction prefix and suffix and
require their sum to reproduce the original interval. Account continuity, claim
markers, source identity, chronology and reward counters remain guarded.

Use first/last eligible observations within each displayed local calendar day,
including history older than the current 10,000-row balance view. No invented
midnight boundary, interpolation, split catch-up reward or pending outcome.
Recovered amounts are partial-day values at current reward quotes, with exact
historical cash costs under the original interval's method. Expired quotes keep
native quantities and costs available. Pre-anchor, missing-observation and
unreplayable intervals remain unknown.

Recovered points enter daily projection only. They are not new committed ledger
children and cannot advance or change cumulative net, current position, live
reconciliation, or existing provenance. Failure of optional recovery keeps the
existing verified table and independent balances available. The selected saved
observations and source records remain local; no network recovery, new database
schema or persistent monetary cache is needed for this slice.

## Interfaces and order

1. Read-only ObservationStore.accountingBoundaries selects actual settled
   first/last observations by wallet/network/source, slot bounds, local dates and
   accounting mode. No 10,000-row cap, no writes or database migration.
2. A historical-accounting module loads successful records on the verified live
   chain and proves full/prefix/suffix replay using the existing integer calculator.
3. Earnings projection merges proven points into daily rows only and labels their
   recovered coverage. Native schema and seven-day limit stay unchanged.
4. Monitor publication passes its existing profile store as the observation reader.
   Initial balance publication must stay responsive; measure the added seam.

## Validation and rollback

Synthetic multi-day recovery, >10,000 observations, time zones/DST, closed/funded
cost methods, pending/stored filtering, exact transaction boundaries, missing or
corrupt evidence/quotes, parent/child disagreement and publication fallback.
Verify no writes to inputs; normal totals/current position must remain identical.
Run repository gates and one independent monetary review. Check native window
and widget with recovered/unknown days. Build a clean universal local package,
retain prior app and a consistent private database/state backup, install and
verify every previous row/reward entry/static setting plus fresh observations.
Rollback replaces only the binary: there is no history migration to undo.

At this milestone, older-week net navigation, pre-monitor/pre-anchor reconstruction,
claim-spanning principal accounting, prospective round rewards, automatic expert
anchors and whole-wallet profit were excluded from the slice.
[Older-week navigation](older-net-history.md) shipped in 0.2.25, followed by
[claim-spanning combined net](claim-spanning-history.md) in 0.2.27 and
[optional claimed-principal attribution](claimed-principal.md) in 0.2.28. Those
successors do not establish acquisition basis or whole-wallet profit; see
[current status](../current-status.md). Existing evidence is never treated as
proof of observations that were not saved.

## Milestone evidence

The source candidate passes 396 tests: 142 Swift, 197 engine and 57 Python.
Generated fixtures cover exact multi-day costs, more than 10,000 saved rows,
time zones/DST, closed and both funded versions, missing/corrupt inputs, expired
quotes, duplicate boundaries, chronological/counter regressions and unchanged
source records. Publication tests prove balances arrive before optional recovery
and that failed recovery preserves the baseline through the actual CLI path.

Independent monetary review identified lost evidence-directory provenance for
funded ancestors after a newer head and reversed adjacent snapshot timestamps.
Both were blocking contract corrections, covered by failing-then-passing tests.
The focused recheck passed with no remaining blockers. Original ledger hashes
stay unchanged; the loader discovers evidence locations from committed records.

A private offline replay recovered 14 supported boundaries across the current
seven-day report with unchanged cumulative total and holdings. Repeating after
quote expiry retained coverage and native quantities while withholding USD.
The replay, including a second diagnostic calculation, took about one second;
it runs after initial publication. This is local evidence, not a performance
guarantee for arbitrary stores or proof of complete days.

The production native loader/controller accepted synthetic recovered output.
Window and widget checks showed the exact recovered cost/net, actual covered
hours, current-price/partial-day qualifiers, and unknown days. No native wire
schema, database migration or historical monetary write is introduced.


The local universal 0.2.24 build 26 was installed from source
`a40683d10125c305e89d49e65d234510613bcde7`. ZIP and read-only mounted DMG
contain 355 identical app files; both executable architectures, checksums,
ad-hoc signatures and generic package privacy passed. All prior observation rows,
reward entries and static settings survived; fresh finalized monitoring resumed.
The installed Overview and widget show supported partial net for all seven days.
The previous 0.2.23 app and consistent SQLite/state backup are retained privately.
Developer ID/notarization remain on hold; no source push or release occurred.
