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
- [x] Verify native validation and consistent window/widget presentation.
- [x] Investigate attributed GPU activity, quantifying supported measurements
  and recording the active-interaction measurement limit below.
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

Independent implementation review found no P0/P1 blocker. An initially deferred
outer-widget heading was subsequently included in the owner's explicit compact
text cleanup: the heading now follows independently available recovered rewards.
The first installed visual check reproduced header/footer clipping when the new
recovered row and catch-up context exceeded the widget height. This is an in-scope
P1: the widget must retain reachable controls. The correction pins its existing
header/footer and lets only the middle summary scroll when necessary, preserving
all amounts and context. The final installed build's top, bottom/goal, detail
route and Escape-to-summary checks pass. The native loader accepts the packaged
engine's exact yields alongside 10,000 real observations. All original profile
state and evidence remain private and preserved.

## Bounded GPU and ownership evidence

The installed 0.2.33 idle Metal capture attributed 7.33 ms of top-level GPU
activity over 61.15 seconds (about 0.012% of elapsed wall time), with twelve frame
labels. This is an attributed interval measurement, not a shader-utilization
percentage or a measurement of the later 0.2.34 binary. Its CPU sample weight was
965 ms (about 1.58% of one core); identified application work primarily prepared
the loaded history outside the UI actor.

The larger profiler/export temporarily exhausted free space. Its generated raw
traces and scratch were removed, database integrity/freshness checked, and later
experiments enforced bounded output and a free-space floor. Financial evidence
was preserved. This incident was profiler output growth, not app cache growth.

Native PID-filtered `metalperftrace listen` produced no records during navigation,
both normally and with temporary per-frame metrics enabled. Enable/listen/disable
all exited successfully and the temporary metrics were disabled. ARM64 legacy
GPU counters cannot supply a meaningful value; privileged `powermetrics` was
unavailable without a password. Active GPU/FPS measurements therefore remain
unknown. Another large trace was rejected because its deferred exporter scratch
could not be reliably capped. There is no perpetual app-owned Metal/display-link
render loop in the source; the app uses value-driven SwiftUI updates and two
30-second timelines.

The original heavily instrumented process showed unreachable array graphs growing
after navigation, then plateauing for over ten minutes. Ownership was unavailable.
Controlled restarts of the identical binary, both with working lite allocation
stacks and in normal mode, found zero unreachable allocations before and after
six navigation/widget cycles. The original graph growth did not reproduce. This
does not establish that the old objects belonged to a framework or certify all
future executions as leak-free. The final 0.2.34 normal-process baseline also
reports zero; its endpoint comparison is recorded after the hour-long sample.

## Owner-requested compact text cleanup

The owner explicitly promoted the crowded widget summary on 16 October after
seeing the recovered rows. The compact card now shows unrefined, refined and gold
amounts plus one fee note. Exact per-asset boundaries, timezone, unrefined-only USD
valuation and catch-up history remain in help and the expanded daily view. A
mining prefix older than five minutes visibly carries its cutoff; missing full-day
assets remain unavailable. Financial math, private openings and journals are
unchanged. This is a compact presentation change, not reduced accounting evidence.
