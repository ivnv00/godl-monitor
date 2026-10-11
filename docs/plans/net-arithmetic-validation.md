# Net arithmetic validation

Owner-promoted on 11 October 2026. Validate the daily and cumulative USD net
relationships before native publication. Developer ID signing and notarization
remain on hold; local ad-hoc packaging and a history-preserving update are authorized.

## Contract

- A supplied daily `netRewardUsd` or cumulative `netPnlUsd` requires its reward
  value and net spend, plus all existing coverage and denomination prerequisites.
  Check net + spend against reward using exact signed integer microdollars.
- The engine independently rounds all three exact rational amounts to six
  decimals, nearest with ties away from zero. Their published relationship may
  therefore differ by one microdollar in either direction. Reject larger errors.
  This is a consistency check, not independent proof of the underlying accounting.
- Preserve negative rewards, negative costs, zero and negative zero. Accept numeric
  equivalents with omitted/trailing zero decimals. Reject nonzero precision beyond
  six decimals in a supplied net relationship; never silently round corrupt input.
  Preserve exact digits beyond UInt64 and Foundation Decimal precision.
- Missing net stays missing, even when reward and cost are available. Do not
  manufacture missing prices, coverage, claim splits or cumulative profit.
  Current and older-week loading use the same validation; stale quotes retain
  their existing availability rules.
- Rejection uses the existing loader/controller error path, keeping previously
  accepted live data and all saved history intact. No schema, ledger, anchor,
  database, settings or saved-publication rewrite is part of this change.

## Delivery and proof

Reproduce a mismatched daily net at the native earnings boundary, then implement
the shared exact guard. Cover both net fields, positive/negative/tie rounding,
large cancellation, malformed precision and missing values. Verify producer
examples independently, live-file rejection/recovery and older-week decoding.
Run the repository gates and one independent accounting/integration review.

Build a committed universal candidate, verify its package and inspect the native
window/widget with synthetic data. Before local replacement, retain the old app
and a consistent private SQLite/state backup. Verify original rows, reward entries
and static settings survive, then check fresh monitoring and history in the
installed app. Rollback replaces only the binary, never newer history with an
older database. Intel execution and minimum-OS testing remain release limitations.

## Source verification

The original loader accepted a synthetic daily net of 999 USD against reward
0.008766 and spend 0.010000; the regression now rejects it. Twelve new native
tests cover both scopes and historical decoding/retry. The full preflight passes
713 tests (191 Swift, 455 engine, 67 Python).

Independent review found no P0/P1 blocker. Its 22,801 signed rational producer
cases reached at most one microdollar of residual; additional actual-guard probes
confirmed the 60-character boundary, large cancellation and hidden precision.
P3, deferred: preserve explicit 60/61-character cases in the committed suite;
the existing large-value tests and independent boundary probes currently pass.

A synthetic production-controller harness rejected inconsistent daily and
cumulative net, retained accepted monitor/goals/rewards and publication bytes,
then recovered on valid refresh. Native window and compact-widget inspection
showed the same exact covered net, unavailable dates and partial-day qualifiers.
Package and installation evidence follows the
committed candidate; no successful upgrade is claimed by this source milestone.
