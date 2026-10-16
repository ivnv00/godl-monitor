# Longer 0.2.38 resource check and remaining helper work

Requested on 17 October 2026 after the short installed 0.2.38 comparison.

## Checklist

- [x] Start a bounded hour on the same installed 0.2.38 process.
- [x] Investigate helper costs independently using isolated, offline inputs.
- [x] Finish the fixed-end hour, recording the sampling gap, graphics, native journeys and heap scan.
- [x] Make only a measured, bounded helper improvement with exact output parity.
- [x] Run focused regression proof, independent review and repository gates.
- [x] Preserve current state, package/install the beneficial candidate and verify it.
- [x] Record storage/evidence preservation, finite resource results and limits.

## Boundaries and acceptance

Keep the installed 0.2.38 process unchanged throughout the hour. Collect native
and transient-child RAM/CPU using exact PID/launch/executable identity and host
Mach timebase, with current-view checkpoints and file/thread/storage bounds.
Use sparse process graphics ledgers, keeping Dirty, compressed subset,
reclaimable and IOSurface separate. Exercise native window/widget at early,
middle and late points where UI control permits. Record failed interactions;
never count an attempted action as verified. No large traces, persistent flags,
restarts or new automatic jobs. Resource probes have fixed time/output limits
and an 8 GiB free-disk floor.

Compare settled windows and recurring peaks rather than treating any peak as a
leak. A finite hour cannot establish behavior over months or expose all Metal
resources/shared WindowServer allocations. Preserve all unique observations,
original accounting evidence, journals, profiles, goals and exact quantities.
Do not lower observation frequency, chart-point count or evidence validation to
improve measurements.

## Selected optimization

The daily-mining cache validates each transaction's local day by calculating a
complete midnight boundary, constructing a formatter and doing a binary search
for each transaction. Only the resulting day is used in that loop. Reuse the
same calendar-day formatter within one cache validation and format each
transaction date once. Keep the exact cache-opening midnight check, all raw
transaction decoding, totals, identity/authority/finality, day/zone rollover,
error preservation and request/deadline behavior unchanged.

This is blocking-in-scope under the user's explicit request to reduce remaining
helper spikes, subject to a material measured benefit and regression proof.
Retaining validated raw caches between stages is deferred: it adds file-change
and memory-lifetime contracts. A young-generation runtime flag produced only a
small workload-specific memory improvement and is deferred rather than changing
the runtime policy of every helper. Native duplicate-load coalescing and full
view-comparison changes remain separate work.

## Proof and delivery ordering

Observe a failing generated performance-budget test before implementation, then
verify exact published amounts and bounded calendar work. Cover local midnight,
DST/offset changes, malformed times/time zones, changed cache files and existing
raw-evidence tampering. Use generated fixtures only in the repository. Compare
five fresh-process pairs with the same generated large cache and exact complete
publication, plus parsed full-view/10,000-point parity on an isolated private
copy. Record CPU/RSS variability and workload limits; keep only small metrics and
one output per variant.

Run focused checks during edits and full Swift/engine/Python/privacy gates at the
milestone. Use one independent review with focused P0/P1 correction/recheck if
needed. Do not restart the installed baseline before the hour ends. Before a
beneficial local upgrade preserve the previous app/installer and a consistent
current database/state backup. No schema migration is intended: rollback replaces
the app and retains newer observations. Verify original bytes and historical
accounting selections with the installed reader, package hashes/signatures,
fresh views and native earnings/history/goals/widget behavior after replacement.
No push, public package upload or release is authorized.

## Helper evidence

The new generated regression first observed 9,404 calendar-format operations for
160 failed cached transactions across an offline load and a fresh refresh. Its
generous budget of fewer than 1,240 operations failed before the change and passes
after it, with identical summaries, unchanged cache bytes and no added RPC or
deployment reads. All fifteen daily-mining tests pass, including successful raw
reward validation, partial recovery/restart, corruption, backoff and deadlines.
New public-service fixtures cover Sofia/New York daylight-saving changes, Lord
Howe's half-hour shift, exact midnight inclusion and prior-second exclusion.
Writing a well-formed wrong-day transaction after a valid read still rejects both
subsequent reads and preserves the file. Independent review found no P0/P1.

Five alternating fresh-process pairs used the same generated 1,000-successful-
transaction cache (about 1.565 MB), with three offline-load/fresh-refresh pairs per
process. The final production module and original installed module body were
verified; every publication matched exactly. Timings include unchanged raw reward
decoding and generator objects remain resident equally in both variants.

| Median measure | 0.2.38 | Candidate |
| --- | --- | --- |
| Process CPU | 1,644.67 ms | 1,257.67 ms |
| Peak RSS | 190.05 MiB | 157.88 MiB |
| Summed validation elapsed | 1,501.45 ms | 1,096.14 ms |

This workload reduced CPU by 23.5%, peak RSS by 16.9% and validation elapsed by
27.0%. Peak RSS ranged 188.83–191.20 MiB before and 156.67–158.73 MiB after.
These are dense-cache measurements, not an installed-app peak prediction; the
current quiet day's small cache has much less removable work. Units follow
[Node 26.7.0 resource usage](https://nodejs.org/download/release/v26.7.0/docs/api/process.html#processresourceusage):
CPU fields are microseconds and `maxRSS` is kibibytes. A separate offline CLI
comparison on the same private saved history preserved the complete parsed view,
including all 10,000 chart points and exactly the same transport size.

The independent prototype also matched 798 structural acceptance/error cases
covering skipped days, fractional offsets, leap/year boundaries and invalid
times/zones. No global date formatter, validation memoization or raw-cache reuse
was introduced.

The full milestone gate passes 865 tests: 206 Swift, 592 engine and 67 Python,
with warnings as errors, privacy and local documentation links. An initial
diagnostic wrapper inherited umask 077, causing an existing explicit-mode fixture
to create 0600 rather than expected 0640. The fixture passed with the standard
022 child mask, followed by a passing complete gate; no production or test
permission behavior was changed to hide the environment mismatch.

## Collector interruption

The app retained its exact PID, launch, source and executable hash, but both
diagnostic collectors received SIGTERM from an unknown sender. The first RAM/CPU
segment ended after 2,186.426 seconds with 10,933 samples. Collection resumed on
the same app after a 161.275-second sampling gap and keeps the original fixed end
time. Do not claim uninterrupted sampling. Cumulative process/reaped-child CPU
ledgers can bridge the gap; RAM/graphics peaks inside it remain unobserved.
Partial evidence and explicit interruption metadata are preserved. No app
restart, collector signal suppression or fabricated interpolation was used.

## Installed 0.2.38 hour

The same app process, launch, source, native hash and strict signature remained
verified through final probes. The CPU window ran 3,600.629 seconds, from 16 October
21:57:52 to 22:57:53 UTC (17 October 00:57:52–01:57:53 in Sofia). Native CPU consumed
64.388 seconds and exited direct helpers 216.381 seconds, with no live helper at
either boundary: together **7.80% of one core**. Cumulative counters include the
collector gap. The 17,199 RAM readings span two segments; a separate 1.616-second
sample interval also occurred. No interpolation or uninterrupted-sampling claim.

| Measure | Start | End | Observed range |
| --- | --- | --- | --- |
| Native RSS | 121.31 MiB | 117.36 MiB | 36.41–145.98 MiB |
| Native physical footprint | 89.88 MiB | 87.25 MiB | 71.28–195.95 MiB |
| Numeric file descriptors | 9 | 9 | 9–12 |
| Threads | 5 | 6 | 4–19 |

Ten-minute footprint medians were 87.72, 91.58, 92.39, 89.34 (incomplete gap bin),
93.30 and 85.75 MiB. RSS medians were 109.58, 95.64, 96.28, 91.86 (incomplete),
97.44 and 104.97 MiB. Footprint did not accumulate monotonically, while late RSS
rose; these observations cannot establish long-term stability. The kernel's
lifetime footprint peak moved from 193.27 to 197.25 MiB and includes pre-window
activity. All 230 observed helpers were transient, with at most one concurrent;
sampled helper RSS peaked at 235.19 MiB. App plus helper RSS peaked at 371.98 MiB,
with potentially double-counted shared pages. Polling can miss shorter helpers.
Total `lsof` entries, including mapped files, were 64→67; those are not numeric
descriptor counts.

All 116 saved-view checkpoints were current. Native navigation and widget/footer
journeys passed early, in three complete middle cycles and one late cycle. A
separate midpoint attempt reached Activity/Goals/Overview but could not open the
widget through the control tool; it is recorded as partial, not a passed cycle.
The bounded final native heap scan exited successfully with **zero unreachable
allocations / zero bytes**, matching the earlier same-process baseline. Every
owned collector stopped; no automatic job or persistent runtime flag was added.

Eight sparse graphics-ledger snapshots all reported 2,342,912 bytes (2.23 MiB) of
graphics Dirty. The swapped/compressed subset fell from 2,260,992 to 262,144 bytes;
reclaimable graphics bytes ranged 0–90,488,832 and ended at 40,157,184. Separate
IOSurface Dirty remained 2,342,912 bytes; its reclaimable bytes ended at 2,342,912
and reached 4,685,824. These are sparse readings, not refresh-peak measurements.
Fifty-four driver-counter reads across two segments showed the same client and
one queue, with no observed reset. Their counter gap was 218.204 seconds because
the cadence differs from RAM collection. Raw units remain undocumented: no GPU
utilization percentage, full Metal memory, total residency or WindowServer claim.

During the hour, observations grew 49,131→49,370 (+239), including a cold-block
rollover. The hot tier stayed at 10,000, packed tail 219→202, archive blocks
152→153, archived observations 38,912→39,168 and dictionaries remained one. The
database grew only 4,096 bytes (47,472,640→47,476,736); the evidence archive stayed
at 120,868,864 bytes with zero WAL, and the two daily caches stayed at 1,510 and
3,243 bytes. This demonstrates the current storage mechanism's operation, not a
fixed lifetime size ceiling. Unique observations continue to grow losslessly.

## Local 0.2.39 delivery and preservation

Installed **0.2.39 build 42**, app-source
`2bfd15fbc148c0e380bee8d565056ad5a64f0a4c`, after every 0.2.38 probe finished.
The Apple silicon release build passes with warnings as errors; the generic ZIP
passes privacy and has SHA-256
`f6e24f40713c2020dc180fd7c94293cf425d998f560abaa7c0eb296eb9658bb4`.
All 367 packaged/installed file hashes and the strict ad-hoc signature match.
The packaged helper reproduces both the complete offline 10,000-point view and
the generated dense-cache publication exactly.

Before replacement, quit the old app/helpers and save a consistent database and
all thirteen root state files. All thirteen were unchanged at binary replacement;
five static settings remain exact after launch. The installed reader verified
all **49,374** pre-upgrade observation tuples and original snapshot bytes, all
**380** journal entries/read states, current latest/recent selection and six
closed/funded accounting selections across 21 original local dates. One new row
was present at the verification snapshot, with further monitoring continuing.
Schema-2 integrity, block/dictionary bounds and indexed recent selection passed.

All **33,509 original accounting-evidence files**, representing 2,214,914,912
decompressed bytes, match their original lengths and hashes. The installed offline
forensic reader produced the identical report for active and private backup
representations with network forbidden; that historical candidate still reports
unavailable, preserving its existing limitation. No accounting evidence, unique
observation, profile or unknown value was dropped to obtain the resource savings.

Installed native Activity, Goals, current daily refined/gold earnings, older-week
navigation and return, compact widget and footer passed. Both window and widget
were visually inspected. Keep the previous app/installer and fresh consistent
backup private. This version changes no storage format: rollback replaces only
the app and preserves newer observations. No push or publication occurred.

After validation and native journeys, a separate 180.22-second installed 0.2.39
idle sample completed with 851 readings. Native plus reaped-helper CPU averaged
7.99% of one core; median native footprint was 86.72 MiB, with at most one helper
and child-free endpoints. It is a smoke check, not another hour or a paired live
speedup. A subsequent current view was 6.60 seconds old with all 10,000 chart
points, both exact daily asset amounts, five unchanged static settings and the
same verified midnight opening. One post-smoke graphics reading reported 2.23 MiB
graphics Dirty and separate 2.23 MiB IOSurface Dirty; full GPU allocation memory
remains unknown. The finite samplers and preservation reader exited successfully.
