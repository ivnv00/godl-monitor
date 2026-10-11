# Claim-spanning historical accounting

Owner-authorized on 2026-10-11. Developer ID signing and notarization remain on hold.

## Contract

Preserve all observations, reviewed anchors, v1 receipts and v1/v2 funded ledger
bytes and hash meanings. Introduce funded ledger v3 only at a supported GODL
claim, and keep subsequent children v3. The existing atomic sidecar publication
and committed-ancestor markers remain the persistence boundary. No migration,
reset, new opening basis, wallet action or transaction submission is involved.

For a covered interval, claim-adjusted GODL change is exact owner receipts plus
closing claimable GODL minus opening claimable GODL. This is a combined change,
not newly mined principal. Old carry-in cancels. Keep its unrefined/refined split
unknown across claims. Include supported owner-paid claim network fees in covered
cash costs; do not double-charge refining/referral deductions already reflected in
receipts/claimable amounts. USD uses current token prices and historical SOL
prices. Negative changes are valid. Coverage remains partial and requires settled
boundaries with no stored SOL. Cumulative unrefined profit after a claim remains
unavailable because principal attribution and earlier refined/gold basis are unknown.

Each admitted claim must pass the existing narrow claim projector and be bound
to its complete finalized interval transaction envelope. Require exact stored
counter conservation: treasury debits = delta(lifetimeRewardsGodl) minus
delta(rewardsGodl) minus delta(refinedGodl). Same wallet/miner/source and referrer,
complete signature/block coverage and existing deployment checks are mandatory.
Detect every claim from transactions, including zero and same-second claims.
Unsupported mixed, rent-producing, injection, OTC and ambiguous routes stay
unknown. Saved RPC evidence is conditional provider evidence, not independent
historical executable or chain authentication.

## Ordering and rollback

1. Pure v3 reconciliation and synthetic counter/claim/cost tests.
2. Collector/service publication and read-only historical/live projections.
3. Native schema/copy and validation, then an independent integration review.
4. Repository gates, generic universal ad-hoc package verification, consistent
   private backup, local app replacement, history/settings preservation and fresh
   monitoring checks. Retain the prior app. A rollback never deletes a newer
   sidecar; unsupported versions must remain untouched and fail closed.

## Required proof

One/multiple/zero/same-second claims, nonzero carry-in, referral rounding,
negative and above-JS-safe-integer amounts, missing/mismatched evidence,
unsupported mutations and routes, counter/fee/identity mismatches, missing prices,
pending/stored SOL, same-day and midnight recovery, duplicate protection,
legacy hash stability, restart/interrupted publication, unknown/newer state
preservation, live/selected-week parity and native rejection of malformed values.
Existing tests protect unchanged legacy behavior. Optional missing historical
records may reduce coverage but must not erase valid legacy rows or holdings.

## Milestone evidence

The full 11 October preflight passed 610 tests (174 Swift, 379 engine, 57 Python),
with warnings-as-errors and source/index/reachable-history privacy checks.
A final focused run of the three new accounting/service/projection suites passed
88 tests. Independent read-only review found no actionable P0/P1 issue in the
contract, legacy compatibility, fee attribution, recovery, native validation or
package inclusion. Changed endpoint refining regimes remain an intentional
coverage limit, not an inferred return.

Fresh public metadata still reports source commit
`4b7bb4c6619d25f52ef9152de906a46027995143`, SDK 0.1.3 and the pinned executable hash.
This is third-party verification metadata, not a new local executable audit.
The developer signing hold and public-release blockers are unchanged.

The isolated native production-controller harness validates the bundled helper's
older-week response: 3.98000000000 combined GODL, 0.000500 USD covered spend and
7.959500 USD net in the generated referral example, with unknown split/cumulative
profit and unchanged live monitor. The window and compact widget render the exact
combined row and leave the unproved denomination split unavailable.
Its first launch through the temporary-directory alias failed helper resolution;
launching the identical preview from a normal local path passed. This separate
path-alias limitation is deferred in the roadmap; no user state was involved.
