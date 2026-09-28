# Earnings availability correction

## Contract

A missing net result is not zero. Closed accounting currently requires absent
mining automations, no deployed funds and no unclaimed SOL rewards. An active
miner can keep accruing tokens without providing a new closed cost boundary.
Do not weaken that boundary or substitute gross rewards for net profit.

The Activity headline will show the value of **recorded accruals today**, before
fees and costs, alongside an explicit verified-net status. Overview also shows the recorded
summary. In the compact widget it replaces the chart when today’s verified net
is unavailable; verified net retains priority when it is available. Sum only saved increases
whose entire observation interval belongs to the named calendar day; exclude
cross-midnight catch-up intervals and identify that omission. Never extrapolate,
infer zero activity from an empty journal, or present this as complete daily
income. Keep native quantities when quotes expire or an asset quote is missing.
All additions and products use checked exact arithmetic; invalid, duplicate,
mixed-wallet or overflowing input cannot yield a misleading subtotal.

Missing accounting must not suppress independently available market quotes or
current gross holding values. Invalid supplied accounting continues to fail
closed. Net status and chart gaps remain distinct from a verified zero.

## Scope and disposition

- Blocking in scope: unexplained missing net headline despite known accruals;
  missing accounting hiding quotes/holdings; related zero/unknown/price states.
- Rejected: treating funding as a mining loss, filling missing values with zero,
  adding accruals to principal movements, bypassing closed-accounting checks.
- Deferred: transaction-level open-mining accounting and historical reconstruction.

## Proof and rollback

Synthetic tests cover exact sums, midnight/DST, absent and expired prices,
missing assets/history, duplicates, wallet mixing and overflow. Verify Activity,
Overview and the widget with a synthetic native build, then all repository gates
and a generic archive scan. No journal/schema migration or user-state rewrite.
Local installation retains the previous app for rollback; repository stays private.

## Verification result

The focused independent recheck found no remaining blocking defects in this
slice. Native synthetic QA covered Activity at 900-point minimum width, Overview,
and the 360-point widget with pending net; expired quotes retained token amounts,
empty history showed no records, unreadable history showed its error, and a
verified numeric net retained its partial interval. The pending widget fits its
existing 600-point height without adding an inner scroll region.

Local gates: 71 Swift tests, 87 engine tests and 3 privacy tests pass. Release
compilation, ad-hoc signature validation and generic source/archive privacy scans
pass. Hosted CI was previously unavailable because of GitHub account billing;
local success is not a hosted CI success or a notarized public-release claim.
