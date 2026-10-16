# Helper efficiency and graphics memory

Follow-up requested on 17 October 2026, after the unchanged 0.2.37 hour-long
check. Keep accounting, evidence and the complete 10,000-point presentation
window intact while reducing unnecessary intermediate work.

## Checklist

- [x] Trace helper allocations and repeated computation independently.
- [x] Measure kernel-accounted graphics memory during idle/navigation/recovery.
- [x] Capture a reproducible helper baseline on a consistent private copy.
- [x] Make the smallest measured optimization and prove exact output parity.
- [x] Run focused regression tests, independent review and required gates.
- [ ] Package/install only a beneficial candidate; preserve current user state.
- [ ] Verify native window/widget, retained evidence and bounded live resources.

## Scope and invariants

The first slice streams ordinary recent observations into the existing monitor
projection rather than retaining 10,000 complete snapshot objects. Existing full
snapshot reads remain available. If cold blocks can affect the requested recent
window, retain the established selection path. No schema, retention, cadence,
wallet/profile, accounting calculation or UI change is intended.

Every original selected point, ordering, exact integer, unknown value and
identity/finality/authority validation must match. Exceptions must close SQLite
iterators before maintenance or another read. Keep recent hot reads independent
of damaged cold codecs. Compact JSON transport may remove whitespace while
preserving the complete parsed DTO.

Defer native load coalescing and daily-cache session reuse: their race and
tamper-validation contracts need separate proof. No persistent helper or reduced
observation frequency is part of this slice.

## Proof and delivery

Compare the unchanged helper with the candidate using the same pinned runtime,
consistent private database/caches, frozen projection clock and disabled network.
Record CPU time, peak RSS and output hashes/counts across repeated runs. Accept
only a material measured improvement without output drift. Private runtime data
and paths stay outside the repository; tests use generated synthetic fixtures.

Test ordinary/compressed/cold selection parity, arbitrary-width exact values,
unknown/miner-missing history, invalid authority/identity/finality, early iterator
exit and publication failures. Run all repository gates and generic package
privacy before a local upgrade. Preserve the previous app and a consistent
current state/database backup; this change requires no data-format migration.
After install verify every original observation/evidence byte and the native
window/widget, history, goals, daily coverage and helper lifecycle. Roll back the
app without replacing newer user data if the candidate fails.

Graphics ledger measurements include only the categories actually exposed by
macOS. Keep dirty/charged, compressed, reclaimable and IOSurface figures distinct;
shared WindowServer resources and a complete Metal allocation inventory are
separate limits. Use bounded output, time limits and an 8 GiB disk floor.

## Graphics-memory evidence

Apple's `footprint -p PID -f bytes --wired --swapped` exposes the process's
graphics ledgers, including owned unmapped graphics allocations. Bounded passive
and 90-second navigation/idle samples on unchanged 0.2.37 found graphics Dirty
cycling between 3.34 and 89.64 MiB, with the same peak during passive monitoring.
Six verified Activity/Goals/Overview/widget cycles were followed by repeated
returns to 3.34 MiB; a final independent snapshot confirmed recovery. The Dirty
figure includes a 1.31 MiB compressed/swapped subset. Graphics reclaimable ranged
from zero to 84.06 MiB passively and zero to 70.30 MiB during navigation; final
reclaimable was 58.30 MiB. Separately labelled IOSurface Dirty ranged from zero
to 6.70 MiB and ended at 2.23 MiB. Do not add these categories into a purported
complete GPU-resource total.

This measures kernel-accounted graphics memory and its short-window recovery.
The Metal resource metric is
[`MTLDevice.currentAllocatedSize`](https://developer.apple.com/documentation/metal/mtldevice/currentallocatedsize),
also described in Apple's
[HUD metrics](https://developer.apple.com/documentation/xcode/understanding-metal-performance-hud-metrics).
Full Metal inventory and shared WindowServer attribution remain unmeasured.
No HUD, persistent setting, trace, attach, restart or re-signing was required.
All probes exited and their private evidence totals about 209 KB.

## Helper implementation and regression proof

The new single-pass recent iterator keeps ordinary full snapshots short-lived
while the existing projection validates and retains every small chart point.
Index-only key metadata selects the streaming path; cold overlap or insufficient
ordinary rows uses the unchanged full-selection fallback. Existing `list()` and
all accounting consumers keep their contract. Runtime JSON loses whitespace,
with the same newline, atomic replacement and notification marker.

Generated tests observed RED before implementation and pass after it. They cover
all three storage schemas, cold fallback, damaged cold codecs, lazy decoding,
exact u64 values, missing miners, profile isolation and SQLite cursor cleanup on
break/projection/decode failure. Iterable projection preserves output and rejects
wrong identity, commitment, authority, time, slot or amount. Review caught silent
`Array.from` coercion for non-iterables; it was blocking-in-scope and corrected
with an explicit guard and a focused passing recheck. Undefined history retains
the existing empty default. Independent read-only/schema/index checks found no
remaining P0/P1. Native JSON decoding and CLI notification compatibility passed.

The full repository gate passes **863 tests: 206 Swift, 590 engine and 67 Python**,
with warnings as errors, privacy and local documentation links. Packaging and
installed-live results are recorded separately below.

## Fixed-input helper benchmark

Five paired runs used the pinned bundled Node runtime, the same consistent
private database/cache copy, a frozen projection clock and forbidden network.
The complete parsed view matched across all runs, including every one of the
10,000 history points. The benchmark covers the offline view helper; normal live
observation also performs RPC, quote and recovery work.

| Median or fixed output | Original | Candidate |
| --- | --- | --- |
| Peak RSS | 239.09 MB | 108.28 MB |
| CPU time | 0.28 seconds | 0.19 seconds |
| Wall time | 0.20 seconds | 0.18 seconds |
| Runtime view size | 2,395,207 bytes | 1,504,158 bytes |
| History points | 10,000 | 10,000 |

Peak RSS fell 54.7%, median CPU time 32.1%, and output bytes 37.2% in this
fixed-input workload. CPU measurements have hundredth-second resolution and
these small samples do not establish a universal speedup. Peak RSS units follow
the local macOS manual and Apple's
[Darwin resource accounting](https://github.com/apple/darwin-xnu/blob/main/bsd/man/man2/getrusage.2),
which specifies bytes. Runtime files remain private; no financial fixtures or
benchmark databases enter the package.
