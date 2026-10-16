# Recover daily mining rewards

Owner correction on 16 October 2026: the daily card showed only rewards observed
since a restart, hiding the larger amount mined earlier that day. This is a core
accounting presentation defect. A partial observation sum must not imply full-day
coverage, and a cross-day balance increase cannot be assigned to a day by guesswork.

## Checklist

- [x] Locate the missing local observation boundary and reproduce the undercount.
- [x] Prove a recovery route using finalized, correctly attributed checkpoint
  logs; independently compare official per-round history without trusting it as
  the application's accounting authority.
- [x] Decode exact integer rewards, reject ambiguous floating-point log values,
  unsupported program revisions and incomplete or failed invocation traces.
- [x] Recover all miner signatures inside the local day with an explicit
  finalized upper boundary and a proven earlier-day pagination boundary.
- [x] Cache bounded incremental work privately; publish balances before recovery,
  preserve existing journals and accounting evidence, and bound network retries.
- [x] Show recovered unrefined credits separately from partially observed refined
  and gold yield, with dates and coverage visible in the window and widget.
- [ ] Run focused regressions, repository gates and one independent review; build,
  install, inspect both surfaces, and verify settings/history preservation.

## Contract

This recovers **unrefined mining credits**, timed by their successful finalized
checkpoint transactions. Round settlement can precede credit, so the label must
state that boundary. It does not reconstruct refined yield, gold accrual, claims,
net income or acquisition cost. Their absent historical boundaries stay unknown.
Never add recovered principal to the existing observed principal, which would
count the same reward twice. Exact raw amounts remain integer strings throughout.

Only the verified program revision and deployment may be decoded. Signature and
transaction identity, finalized commitment, slot/time boundaries, miner and round
accounts, complete invocation logs and successful ancestry must all agree. A log
amount is accepted only if exactly one u64 produces that f64 under the program's
conversion; binary search proves uniqueness rather than rounding a guessed value.
Any missing transaction, ambiguous amount, malformed log, unknown credit path,
provider failure or incomplete pagination prevents a complete-day claim.

Recovery is optional enrichment. Existing balance publication, observed rewards,
profile isolation, unsupported-state preservation and manual recovery keep their
current behavior. Newly derived recovery caches are bounded and replaceable;
original observations, journals, anchors and evidence are never pruned.
No wallet controls or public publication are introduced. Binary rollback keeps
newly written user history; it never restores an older database over live data.

## Source milestone evidence

The full local preflight passes 771 tests: 205 Swift, 499 engine and 67 Python.
Production decoder and service replay of privately retained finalized responses
agree with independent per-round history and the exact principal balance change.
The current production native loader accepts that recovery together with the
10,000-point observation history. Synthetic coverage includes logged and unlogged
ComputeBudget instructions, caught CPI rollback, ambiguous f64 inversion, midnight
pagination ties, cache corruption, source changes, frozen targets and resumable
network budgets. One independent integration pass found no P0/P1 blocker.

The ten-second limit bounds network recovery work. Cache validation and final
disk writes are outside that budget; actual replay-cache validation took 133 ms
in review. A strict whole-helper wall-clock bound remains a deferred P2, while
the native observer retains its existing 35-second watchdog. This is not a
guarantee of perfect performance under every provider or storage condition.
