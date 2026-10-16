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
- [x] Run focused regressions, repository gates and one independent review; build,
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

## Installed milestone

Installed locally as 0.2.33 build 35, Apple silicon, ad-hoc signed from
`94bface159abe635db0e6b01cb3b72693500ada0`. The packaged engine and current
native loader reproduce the recovery; the installed window and widget visibly
show the principal, actual credit-time boundary, configured goal and separately
dated partial yield. New observations and daily recovery continue after launch.
All 48,077 pre-upgrade observations and 375 prior journal entries survived; ten
state files matched at replacement and five static settings remain unchanged.
The prior app and consistent database/state backup remain private. No source
push, release upload, visibility change, wallet control or transaction occurred.

The current installer and previous working universal pair remain available.
Removing 28 obsolete generated ZIP/DMG files and the regenerable Swift cache
reduced their measured allocated storage by about 3.35 GiB. Original observations,
accounting evidence, journals, anchors and rollback apps were not pruned.

A three-minute installed sample (180 one-second samples) kept views current with
at most 15 seconds between updates and advanced recovery across two minute-scale
cycles. App file descriptors remained 64 at both endpoints, app RSS 97–143 MiB,
and the cache peaked at 1.30 MB against its 16 MiB cap. Helpers peaked at 345 MiB
RSS during brief sampled runs; no timeout or stale-view symptom appeared. SQLite
gained expected observations and evidence-directory count stayed stable. GPU,
exact request counts and long-duration leak behavior remain unmeasured.
