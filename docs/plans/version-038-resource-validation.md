# Longer 0.2.38 resource check and remaining helper work

Requested on 17 October 2026 after the short installed 0.2.38 comparison.

## Checklist

- [x] Start a bounded, uninterrupted hour on the installed 0.2.38 process.
- [x] Investigate helper costs independently using isolated, offline inputs.
- [ ] Finish the hour, including graphics recovery, native journeys and heap scan.
- [x] Make only a measured, bounded helper improvement with exact output parity.
- [x] Run focused regression proof, independent review and repository gates.
- [ ] Preserve current state, package/install the beneficial candidate and verify it.
- [ ] Record storage/evidence preservation, finite resource results and limits.

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
