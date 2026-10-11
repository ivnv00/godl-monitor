# Current balance and SOL validation

The 0.2.20 slice closes an explicitly promoted validation gap. A synthetic
monitor file with 12 GODL in base units and 999 GODL in its display was accepted
by the native loader. The analogous mismatch also passed for SOL. This was not
evidence of corruption in the user's profile: the corresponding live fields
passed a read-only consistency check before implementation.

The file-loading boundary now checks current unrefined/stored-refined GODL at
11 decimal places and SOL at 9. SOL coverage includes stored claimable balance,
last-played deployment and each automation's balance, per-square amount and
executor fee. Integer strings must be canonical unsigned decimal text and the
fixed-scale display must match them exactly. Existing reward-amount validation
keeps its stricter UInt64 limits; legacy principal/SOL representations continue
to preserve larger integers. No monetary conversion uses floating-point math.

Unavailable amounts and omitted automation fields stay unknown; observed zero
remains observed. Signed accounting spend/profit, prices, goals and existing
history semantics are unchanged. This slice does not implement transaction-level
active-mining accounting or reconstruct earlier reward intervals.

## Proof and preservation

Regression tests first failed on 24 malformed GODL and 88 malformed SOL cases,
then passed after the boundary fixes. Acceptance tests cover zero, one base unit,
UInt64 maximum and larger legacy amounts, unavailable/missing values, unchanged
rejected-file bytes and recovery with a subsequent valid document.

A synthetic production-controller check exercises invalid GODL, invalid SOL and
valid recovery publications. It checks that errors retain the previous accepted
observation and reward inbox, then clear when valid data arrives. An independent
review found no actionable issues in the implementation or preservation contract.
Final gates, package provenance and installed upgrade evidence are recorded in
[current status](current-status.md).

The update has no schema migration or history rewrite. Retain the prior app and
a consistent private state/database backup before replacement; validate old rows
and static settings after reopening. To roll back, quit the monitor and restore
the previous app bundle. Do not overwrite newer history with a snapshot unless a
separate data-recovery investigation requires it. Developer ID signing and Apple
notarization remain on the owner's hold.
