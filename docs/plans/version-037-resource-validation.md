# Installed 0.2.37 resource and functionality validation

Owner requested a longer check on 16 October 2026 after the lossless storage
installation. Keep the installed version and source fixed during the sample.
All private telemetry and financial evidence stay outside the repository.

## Checklist

- [x] Confirm installed 0.2.37 build 40, app source
  `65bcc312a25b5ccd78ca5f332aaa6e68a1ed8fb6`, signature and process identity.
- [x] Measure app-attributed GPU counters during idle and verified navigation.
- [x] Complete a one-hour CPU/RAM/helper sample on one process, with baseline
  and final heap checks and settled periods after interaction.
- [x] Independently compare retained observations, exact raw evidence, accounting
  selections, settings/journal and read-only installed helpers.
- [x] Check window/widget, Activity, goals, older history and daily rollover.
- [x] Record growth, limits and any blocking regression; stop all diagnostics.

## Measurement contract

Use lightweight bounded OS/driver counters. No Metal trace/export, persistent
profiling mode or unbounded scratch. Maintain an 8 GiB free-space floor; bound
individual outputs and diagnostic lifetimes. Preserve normal monitoring and all
original history. Existing 855-test, exact-byte expansion and package proofs
remain dated evidence where source/runtime inputs are unchanged.

Use per-process CPU-time deltas, RSS/footprint and open-file entries/threads,
plus transient helper counts and saved-view freshness. Separate warm-up and
interaction peaks from settled windows. A restart invalidates a same-process
soak claim; a provider delay is recorded rather than silently excluded. GPU
driver units are undocumented: retain raw units and client identity, never
equate them with hardware utilization, FPS or compositor work.

Acceptance is unchanged accounting/history behavior and no sustained resource
accumulation in the measured workload. Finite observations cannot prove that
all future workloads are leak-free. Reproduce any P0/P1 before changing code;
unpromoted P2/P3 remain in the roadmap.

## Completed GPU and storage checks

The installed process and one Metal client stayed fixed. The driver counter
advanced 1,999,959 raw units over 30.005 seconds idle, 3,961,084 over 60.011 seconds
containing six verified Activity/Goals/Overview/widget cycles, and 1,303,958 over
30.006 seconds afterward. No reset or missing client was observed. A separate
initial active window had no verified controlled cycles and is labelled separately.
Prior calibration supports nanosecond-scale estimates (roughly 2.000, 3.961 and
1.304 ms respectively), with a 19% discrepancy from public Metal timestamps;
these remain qualified estimates, not GPU percentages or a causal comparison.
The same lightweight client exposes no GPU allocation bytes/resource counts, so
GPU memory stability remains unknown. A separate once-per-minute extension
completed 52 samples over 3,028.158 seconds, from 20:31:23.860 to 21:21:52.041 UTC.
It added 117,754,750 raw units, with the same client and one queue throughout;
there were zero resets, missing clients or replacements. This is a measured
50.47-minute subwindow. All GPU samplers and their read subprocesses exited;
evidence totals 82,402 bytes. No trace, exporter or persistent setting was used.

Independent installed-reader validation reproduced all 48,694 preserved tuples,
33,509 evidence files and 2,214,914,912 original evidence bytes. All twenty original
dates in three windows of closed/funded selection matched with a fixed original
slot cutoff. Latest/recent views matched the full stream; indexed recent reads,
schema/archive integrity and block/dictionary bounds passed. Five static settings
and all 377 prior journal entries survived, with newer observations and a newer
entry retained. All 367 package files and strict signature matched; forensic CLI
output matched the preserved backup without network. All 59 focused synthetic
tests passed. No P0/P1 regression was found; existing deferred limits stay dated
in the roadmap.

## CPU and memory instrumentation

The normal signed process is not restarted or re-signed for profiling. Baseline
`leaks` reports zero leaked allocations; macOS restricts displayed/saved memory
contents for this process. No memory graph is exported. Physical footprint and
RSS are recorded separately, with bounded `vmmap -summary` endpoints.
The sampled `lsof` count includes numeric descriptors, mapped text files and the
working directory; report it as open-file entries rather than numeric descriptors.

The longer sample uses cumulative native CPU time plus `proc_pid_rusage` counters
for reaped helper processes. Counter units are verified rather than assumed:
Mach absolute ticks convert through this Mac's 125/3 timebase, and converted
native totals match `ps` within 0.1 seconds. Apple's
[task accounting](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/task.c)
and [child accumulation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_resource.c)
provide the accounting contract. Helper CPU has its own measured subwindow;
currently running children can shift CPU accounting across its boundaries.

## Native interactions and midnight rollover

The hour includes twelve verified Activity/Goals/Overview/widget cycles in two
separate batches, older-week navigation and return to today, and five minutes of
live refresh with the saved-balance chart expanded. The six earlier controlled
GPU cycles are separate from this hour. The chart was collapsed and Overview
restored for settled intervals after interaction.

At Sofia midnight on 17 October the unchanged process automatically captured
both refined and gold openings. An independent read-only check matched the
saved bracket to the retained finalized snapshots, projected balances, reward
factors and claim markers. Finalized block times bracketed midnight at minus one
and plus fourteen seconds; the proof hash matched. Both assets then published
from the new opening. No opening was supplied or synthesized by the check.
The native window advanced its latest week to 11–17 October and showed the new
coverage; the compact widget retained its earned-today card and footer. Prior-day
opening/cache files were preserved privately before rollover.

## Completed one-hour resource sample

The unchanged installed process completed **3,600.005 seconds and 721 samples**,
from 23:21:52 on 16 October to 00:21:52 on 17 October, Europe/Sofia. Its launch
identity and final executable hash matched the start. All 121 detailed saved-view
checkpoints were current; the maximum observed view age was 15.942 seconds.

| Measurement | Result |
| --- | --- |
| Native CPU over the hour | 65.47 CPU seconds; 1.82% of one core |
| Native plus reaped helpers, separate 3,301.727-second window | 60.776 + 248.878 CPU seconds; 9.38% of one core |
| Native RSS, sampled | 50.9–127.2 MiB; 107.1 to 91.8 MiB at endpoints |
| Native physical footprint, last ten minutes | 84.1 MiB median; refresh peaks still occur |
| Physical footprint from endpoint memory maps | 68.2 to 91.2 MiB; OS-recorded peak 198.9 MiB |
| App plus helper RSS, maximum sampled sum | 486.0 MiB; individual helper maximum 365.0 MiB |
| Helpers | Transient; at most one per sample, 174 distinct helpers sampled |
| Open-file entries | 64 to 65; range 64–69 including mapped files |
| Threads | Eight to six; range four–nine |
| Heap tool | Zero unreachable allocations/bytes reported at both endpoints |

Native ten-minute CPU windows ranged from 1.49% to 2.39% of one core, with the
larger windows containing interaction. The final idle window averaged 1.49%.
RSS had a negative fitted trend after the first ten minutes. Physical footprint
continued to cycle during refreshes: the final ten-minute range was 75.3–179.7
MiB, with the last timed sample at a refresh peak and the subsequent memory map
at 91.2 MiB. Heap allocations rose from 32,486 to 33,926 KB while both scans
reported zero leaks. The observed workload shows no sustained accumulation;
these measurements do not establish that all retained memory is necessary or
that future workloads are leak-free. GPU allocation memory remains unmeasured.

## Live storage growth

The hour added exactly 240 observations, from 48,749 to 48,989. The hot window
ended at 10,000 rows, the packed tail moved from 93 to 77, and one 256-row block
advanced cold storage from 151 to 152 blocks. One dictionary remained. The main
database grew 131,072 bytes, from 47,341,568 to 47,472,640 bytes; its WAL was empty
at both endpoints. This short whole-file delta is not a yearly growth forecast.
The cold-payload projection and unique-evidence limits remain in the
[storage contract](long-term-history.md#growth-evidence-and-limits).

The evidence archive stayed at 120,868,864 bytes. The derived mining cache reset
normally at midnight from 1,168,150 to 1,510 bytes; the yield cache ended at 3,243
bytes with its new proof. Original evidence and observation preservation are
checked again through the installed reader after the timed endpoints.

## Post-soak regression and cleanup

The installed-reader replay completed after the live block rollover. Its read
snapshot contained 48,991 observations: all 48,694 pre-install originals were
byte-exact and 297 newer rows remained. Original tuple hashes, all six accounting
selection hashes across twenty dates, all 33,509 evidence files/2,214,914,912
original bytes and the offline forensic report matched their pre-soak proofs.
Latest/recent reads and both database integrity checks passed. Five static
settings and all 377 original journal entries survived; the journal now had 379
entries. The 152 blocks, packed tail, one dictionary and indexed recent reads
remained within bounds. All 367 installed package files and strict signature
matched again. No P0/P1 regression was found; no app source, installation or
profile repair was needed.

Fresh `python3 scripts/check.py --suite all` passed **855 tests: 206 Swift,
582 engine and 67 Python**, plus source/index privacy and documentation links.
`python3 scripts/check-privacy.py --archive dist/GODL-Monitor-local.zip` also
passed. All resource samplers, heap/map probes, validators and test processes
exited. The private proof totals about 0.61 MB, with owner-only access; no large
trace or expanded evidence copy was created. The GPU sampler's minimum measured
free space was 31.53 GB, above its 8 GiB floor. The app remains running on Overview.

This completes the version-specific finite check. Multi-day/year-long resource
behavior and GPU allocation memory remain unmeasured; the existing later growth
check remains open. Compression continues to retain unique evidence, so its
activity-dependent storage growth has no fixed lifetime ceiling.
