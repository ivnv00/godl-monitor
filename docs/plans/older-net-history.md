# Older-week verified-net navigation

Owner-approved 11 October 2026 after 0.2.24. Add previous/next/latest-week navigation
to verified-net details in Overview, its detail sheet and compact widget details.
Keep the widget's summary, current balances and cumulative result live. Developer
ID signing and notarization remain on hold.

## Contract and interfaces

A selected end date requests exactly seven local calendar dates. Actual current
time still controls quote freshness and today's special endpoint selection.
Navigation stops at the earliest verified checkpoint's closing day; the first
page may contain earlier unavailable dates. No pre-anchor values are invented.

An offline helper reads the existing profile database in SQLite read-only mode,
verified checkpoint chain, immutable reconciliation evidence and cached quotes.
It uses the existing full/prefix/suffix recovery proof and exact monetary math.
It emits a bounded response with wallet/network/program/decoder identity,
finalized observation provenance, requested end date and earnings. It performs
no RPC, quote fetch, database creation/migration, journal update or publication
to the live monitor-view file. Missing optional recovery evidence stays unknown;
unverifiable supplied accounting or response identity is rejected.

Native response validation checks identity, requested timezone and exact seven
calendar dates, observed boundaries, within-day coverage and monetary invariants.
Historical results live in a separate in-memory controller. Obsolete requests
are cancelled and rejected by generation. Wallet/source/timezone changes reset
selection; quote or accounting changes refresh a selected historical page.
Failure shows a retry state without relabelling today's values as an older week.

Shared Warm Ledger controls expose Previous seven days, Next seven days and
Latest week beside the verified-net range. Dates, partial coverage and current
price qualifiers remain explicit. Recorded gross history retains its own range.

## Order and proof

1. Test then add engine date selection, read-only store and offline CLI.
2. Test then add native calendar/response/request lifecycle; integrate shared UI.
3. Verify older weeks, earliest partial page, missing dates, expired prices,
   signed results, DST/year boundaries, malformed sources, concurrent refresh,
   out-of-order responses, cancellation/retry and profile isolation.
4. Run repository preflight, one independent review and native window/widget
   journeys. Build universal packages from a clean source commit, validate
   slices/signatures/privacy/ZIP-DMG identity, then install locally.
5. Before replacement, cleanly stop the app and retain its bundle plus a
   consistent private SQLite/JSON backup. Verify all prior rows, reward entries
   and static settings, plus fresh observations after launch.

No storage migration is introduced. Rollback replaces only the app bundle; do
not restore old data over newer observations. Pre-monitor/pre-anchor recovery,
claim-spanning principal, prospective rewards and whole-wallet profit were excluded
from this navigation slice. Later [0.2.27 claim-spanning history](claim-spanning-history.md)
and [0.2.28 claimed-principal attribution](claimed-principal.md) delivered supported
combined net and optional exact claim pieces, retaining acquisition-basis and
whole-wallet-profit limits. This navigation milestone authorized neither a push
nor a public release. Later source synchronization is recorded in
[current status](../current-status.md); public release remains gated.

## Implementation verification

The full preflight passes 416 tests (154 Swift, 205 engine, 57 Python), including
strict response validation, bounded transport/exit status, stale request rejection,
calendar boundaries and the offline read-only CLI. Release compilation uses
warnings as errors. One independent monetary/integration review found no blocking
or actionable deferred findings.

An isolated synthetic native harness exercised the production controller and
bundled helper, exact old-day cost/net and unchanged live monitor state. Overview,
its earnings sheet and the 360-point widget all navigated older weeks. Earliest
page limits, uncovered dates, failure/retry and return to latest were checked;
partial-day/current-price qualifiers and compact controls were visually inspected.
Private copied-history replay recovered a supported older week and retained
unknown net for incomplete early reward inputs, with identical cumulative totals
across pages. No real history, wallet or accounting evidence is checked in.

SQLite read-only access can create coordination WAL/shared-memory files, but does
not change logical observations, the main database, quotes, checkpoints or journals.
The helper must see live WAL entries, so immutable mode is deliberately not used.
Local package and installation evidence is recorded in
[the current status](../current-status.md).
