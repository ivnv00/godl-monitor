# Current holdings USD validation

Owner-approved on 11 October 2026 after installed 0.2.25, followed by read-only
GODL claim evidence. This promotes the bounded holdings relationship validation
from the deferred monetary-validation item. Developer ID signing and
notarization remain on hold.

## Demonstrated gap and boundary

A synthetic native-loader probe accepted three observed zero token balances with
holdings USD of 1, 2 and 999, while the market had only a GODL quote. A claimable
USD goal then reported 1002 and reached. This establishes a P2 input-validation
gap, not evidence that the normal engine produces incorrect holdings.

Validate only current `holdings.unrefinedUsd`, `refinedUsd` and `goldUsd` against
their corresponding observed token amounts and exact-mint quotes. The engine's
integer/rational multiplication and six-decimal rounding remain authoritative.
Validate at the native file boundary before accepting a monitor publication.
Keep signed historical costs, net equations and cumulative accounting outside
this slice. Legacy goal-target validation remains a separate deferred item.

## Invariants and delivery

- A supplied holding requires its observed quantity and matching asset quote.
  Zero quantity cannot carry positive USD. Wrong balances, prices, assets or
  rounding must not produce accepted holdings.
- Missing holdings remain missing. Expired quotes keep valuations unavailable in
  the UI. Do not manufacture a zero or reject supported large principal values
  merely because they exceed UInt64.
- Rejection uses the existing loader failure path, preserving the previously
  accepted observation and every saved profile, goal, reward and accounting file.
- Use exact integer/decimal calculations; share the engine's rounding contract.
  No database migration, journal rewrite or persistent valuation cache.

First add failing boundary tests, then implement the smallest exact comparison.
Test valid producer output, zero and absent balances, missing/wrong quotes,
positive mismatches, rounding edges, large exact quantities and expired prices.
Verify claimable goals require complete fresh validated values, plus rejection
followed by a valid refresh without replacing prior state on failure.

Run Swift, engine, Python and privacy gates, one independent review, and native
window/widget checks. Build a committed universal candidate. Before an authorized
local update, retain the old app and consistent private database/JSON backup;
afterward verify all prior observations, rewards and static settings plus fresh
monitoring. Rollback replaces only the binary, never newer history with old data.

## Recommended following slice (historical)

This recommendation preceded the delivered [receipt inspector](claim-evidence.md),
[0.2.27 claim-spanning history](claim-spanning-history.md) and
[0.2.28 claimed-principal attribution](claimed-principal.md). Their contracts and
[current status](../current-status.md) describe the delivered scope; the original
recommendation below records this milestone's boundary.

Prove exact evidence for one supported standalone owner GODL claim from saved raw
transactions, after verifying the pinned claim handler. Show/provide proven token
receipt and SOL fee/rent separately; do not infer mined principal from a balance
decrease, advance accounting or rewrite cumulative totals. Reject ambiguous,
mixed, failed and unsupported claims. This is a prerequisite for a later versioned
claim/principal bridge, whose treatment of claim fees and claimed principal needs
an explicit monetary contract. Pre-anchor/pre-monitor reconstruction remains later.

See the [backlog](../roadmap.md), [accounting limits](../accounting.md) and
[installed baseline](../current-status.md).

## Source milestone evidence

The 17 new native boundary tests pass after demonstrated red failures. The full
preflight passes 433 tests: 171 Swift, 205 engine and 57 Python, including privacy
and documentation checks. Independent review found no actionable issues.

A synthetic production-controller harness rejected an inconsistent gold USD
value, retained its accepted monitor, goals and reward inbox, left the supplied
publication bytes intact and recovered on a subsequent valid refresh. Native
window and compact-widget inspection showed the validated values and existing
staleness/unknown qualifiers. This milestone changes no persisted schema or
historical accounting. The combined 0.2.26 package and history-preserving local
installation passed; see [current status](../current-status.md) for the exact
candidate provenance, checksums and preservation evidence.
