# Full-day refined/gold yield and resource validation

Owner promoted this work on 16 October 2026 after the installed daily principal
recovery. Keep the checklist current. Original observations, journals, settings,
anchors and accounting evidence remain protected; all real history and profiler
artifacts stay outside source and packages.

## Checklist

- [x] Recover exact opening and closing refined state, or demonstrate the precise
  missing evidence; never relabel a partial observation as a complete day.
- [x] Recover gold distributions and claim boundaries with exact factor math,
  then reproduce the current stored amount and cumulative earned counter.
- [x] Implement bounded, resumable private recovery, preserving early balance
  publication, source/profile isolation and independent per-asset coverage.
- [ ] Verify native validation and consistent window/widget presentation.
- [ ] Measure attributed GPU activity at idle and during native interaction.
- [ ] Investigate unreachable allocations with ownership/growth evidence.
- [ ] Complete a continuous hour-long app/helper resource soak; distinguish
  profiling overhead, PID/version segments and expected stored observations.
- [ ] Run relevant regression tests and required gates, independently review,
  package/install if source changes, verify profile preservation and update status.

## Accounting invariants

A full-day result is a local-midnight-to-dated-finalized-boundary prefix, not a
prediction for the remaining day. Native amounts use exact integers and fixed
point arithmetic, including the protocol's order of flooring. A claim is a
receipt and state transition, not negative yield or newly earned principal.
Recovered rewards are never added to the same observed increases again.

Historical account bytes must actually describe the requested slot. A provider
ignoring a historical-slot parameter is not an archive. Alternative reconstruction
must prove complete relevant transactions, instruction attribution, event/claim
amounts, program revision, transaction ordering and initial/final state parity.
Only explicitly compatible historical revisions may share a decoder. Different
assets can have different recovery availability; a combined USD total requires
consistent covered boundaries and fresh validated quotes for every component.
Net accounting remains under its separately reviewed cost basis.

Gold distribution events contain exact raw numerator/denominator fields. A
candidate replay must reproduce the shared GoldVault factor and totals as well
as the miner's settled factor, stored gold and lifetime counter, including every
claim and principal-weight change. Refined yield requires its own exact treasury
factor boundary; gold events alone do not establish it.

## Resource proof and safety

Measure resident/physical memory, file descriptors, threads, helper lifetimes,
update freshness and bounded derived-cache growth separately. Reserved virtual
address space is not physical RAM. Persistent observation/evidence growth is
intentional history, not automatically a leak. A finite soak cannot prove that
all future operating-system/provider behavior is leak-free.

GPU evidence must identify this app's PID. System-wide graphics activity and
profiler memory/storage are separate. Generated profiler output must have an
explicit size cap and free-space floor before another capture starts. Retain
small sanitized target measurements and diagnostics; remove large generated raw
traces after extraction. Never retain or print unrelated launch-environment
credentials. A profiling-induced disk-pressure episode requires database and
freshness checks before continuing.

Unreachable allocations require repeated growth/ownership evidence. Do not call
framework caches an app leak, and do not dismiss measured graph growth without
investigation. Profiling restarts divide the continuous soak into explicit PID
segments. Keep production read-only and preserve binary/data rollback before any
installation; never restore old history over new observations.

## Implemented accounting seam

The private replay recovers a midnight Treasury factor from a passive claimant's
retained pre-claim factor, complete ordered Treasury history and every relevant
claimant's principal since its preceding claim. A gold event supplies an exact
total-unclaimed anchor. Four independent claim-to-claim intervals reproduce their
actual SPL token payouts, including checkpoint settlement ordering and flooring.
Gold replay reproduces shared factors/distributed totals, personal factors,
stored rewards, lifetime counters and all intervening claim transfers. The
historical and current revisions have byte-identical relevant state, checkpoint,
claim and gold-distribution source files. Raw responses, source hashes and the
actual opening values remain private. Nothing estimates the missing day from a
balance percentage or monitoring duration.

`daily-yield-service.mjs` projects refined and gold independently from this
verified opening. Refined requires the unchanged GODL claim marker strictly
before midnight; after a GODL claim, unavailable refined yield remains explicit.
Gold uses lifetime plus pending yield, so claims do not erase earned gold. Both
supported revisions have no reset/close path for an existing MinerExtended.
Native validation checks exact opening-plus-yield relationships against the
current same-slot balance/cumulative counter. Summaries are date/profile/source
bound. The UI keeps recovered mining principal and passive rewards on their own
dated boundaries; partial journal history and historical net remain separate.

Normal polling reads/writes a compact private sample without additional RPC.
At a day transition, at most two two-second block-time requests establish a real
chain-time bracket. Equal shared factors **and** equal projected amounts establish
zero yield across that bracket, allowing a proved opening for each asset.
An offline gap containing a factor change is unknown until separately recovered.
This is deliberately not universal automatic historical reconstruction.
Files are capped at 128 KiB, compact proof retention is 48 hours, provider failures
back off for 60 seconds and corrupt/unsupported files remain untouched. Expensive
historical replay is a one-time private recovery, never part of normal polling.

Independent implementation review found no P0/P1 blocker. One P3 outer-widget
heading fallback was deferred: with no mining coverage, its outer label can still
say observed/partial while the inner refined/gold labels carry exact coverage.
Installation and visual/resource evidence are recorded after delivery checks.
