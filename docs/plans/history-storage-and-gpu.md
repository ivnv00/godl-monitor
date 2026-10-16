# Saved history storage and GPU verification

Owner promoted both checks on 16 October 2026. Keep all real data and captures outside the repository.

## Checklist

- [x] Inventory actual observation, cache and accounting-evidence storage.
- [x] Review lossless storage interfaces and downgrade risks independently.
- [x] Measure per-process GPU counters during matched idle and navigation windows.
- [x] Add lossless observation compression with bounded maintenance and exact history reads.
- [x] Compress raw accounting responses/cache; retain plain reconciliation records and stop expensive reads after a known incompatible program deployment.
- [ ] Verify synthetic failure/restart/isolation paths and original-byte parity on a private copy.
- [ ] Run regression/privacy/package checks and one independent implementation review.
- [ ] Install locally with preserved original evidence, verify window/widget and fresh observations, record actual storage savings.

## Invariants and interfaces

Every original snapshot, slot, accounts hash, raw response and envelope must remain recoverable byte for byte. Unknown, malformed and unsupported original evidence is preserved. Financial amounts and accounting selection do not change. Compression is lossless; no age-based deletion or downsampling. Derived caches retain existing caps. Unique retained history still grows, so a fixed total ceiling cannot be promised without a separate owner-approved deletion/export policy.

Observation reads must work across original and compressed rows, including old-week accounting, exact duplicate/conflict detection, wallet/network isolation and u64 slot order. Normal refresh maintenance is bounded; whole-database vacuum/expansion is offline. Compressed formats are versioned, validated and fail closed. Older binaries must fail explicitly rather than silently omit compressed history.

Raw response and finalized-cache compression keeps reconciliation records, committed markers, checkpoints and settings plain. Plaintext errors other than absence never fall back. Compressed corruption is not a cache miss. Decompressed byte limits apply before JSON parsing. Conversion is serialized with the accounting writer, verifies complete original bytes before removal, preserves conflicting copies and is resumable after interruption.

## Ordering and rollback

Implement and test on generated synthetic data first. Trial on private consistent copies; compare complete byte/hash inventories and accounting projections. Before installation stop the app and owned helpers, preserve a consistent current database plus private evidence manifest and prior binary. Never overwrite newer observations with an old backup. A downgrade after compression requires lossless expansion of all current records before launching the older reader; rehearse this on a copy.

## Test matrix

Cover mixed formats, exact reopen/expansion, duplicate/conflict/order, multi-wallet isolation, read-only nonmutation, malformed/unsupported input preservation, bounded maintenance, interrupted writes, corrupt/oversized compressed data, cache hits without RPC, old-week accounting and claim inspection. Verify installed packaged imports, current view and preserved real evidence privately.

## GPU safety

Use target-attributed lightweight registry counters if supported; retain raw units when undocumented. No heavy Metal trace/export unless recording, finalization and scratch can all be capped together. Every diagnostic has a size bound and an 8 GiB free-space floor. Absence of metrics is unknown, not zero.

## Implemented seams and review

Storage v1 uses a hot table plus independently deflated older rows with a shared
preset dictionary, complete original-byte SHA-256 and selection metadata. Keep
at least 10,000 hot snapshots per wallet/network. Each post-publication pass is
limited to 128 rows and 2 MiB of original bytes. Reusing dictionaries during
one-row maintenance prevents a new full seed from cancelling the space savings.
The logical view requires the codec; unsupported older readers fail explicitly.

Independent review found a P1: selecting recent snapshots through the UNION view
decoded the whole archive before LIMIT. Recent reads now select an indexed,
materialized key window first and decode only those selected rows. The focused
recheck measured zero archived decodes for both latest and 10,000-row reads on a
synthetic 11,000-row store. A damaged older payload cannot break current-window
publication. A separate focused check confirms dictionary reuse and isolation.
No remaining P0/P1 was found. The roadmap retains the unusual invalid-UTF-8 batch
starvation case and oversized-cache limit as deferred P2/P3.

Raw/cache files use exclusive, durable gzip publication and exact byte checks.
Claim inspection accepts gzip while preserving its 8 MiB decompressed limit.
Known incompatible deployments stop before expensive wallet reads; the dated
accounting status and later deployment race checks remain intact.

## Lightweight GPU result

The exact-PID driver counter was read without a recorder, exporter, persistent
setting or scratch files. PID/client identity remained stable with no resets.
A 30.006-second idle window advanced accumulatedGPUTime by 2,346,792 raw units;
a 60.002-second mixed active window advanced it by 2,036,625 units, across seven
positive intervals. Goals/Overview navigation and menu/widget-title activity were
confirmed; six complete cycles were not verified. Sparse interactions do not
support a causal idle-versus-active comparison.

Apple does not publish this counter's units/accounting contract. An independent
8 MiB Metal blit probe compared 2,854,708 driver units with 2.399 ms from public
Metal command-buffer timestamps. This supports nanosecond-scale interpretation,
but the 19% difference prevents treating the metrics as identical. Interpreting
the target deltas as nanoseconds would give about 2.35 ms idle and 2.04 ms active;
these are qualified estimates, not hardware GPU-utilization percentages.
WindowServer/compositor work is outside the PID attribution. The sample supports
sparse app-owned GPU work, not a claim of zero GPU use or universal leak freedom.
Registry reads stayed below 58 KiB with a 1 MiB read cap and two-second timeout.
The 8 GiB free-space floor held; all diagnostic processes exited.

## Offline maintenance procedure

Quit GODL Monitor and wait for its owned helpers to exit. Keep the current app
and a consistent private backup before conversion. Set `APP` to the newer app
bundle and `PROFILE` to the intended existing profile; paths below are placeholders,
not another user's profile. The helper requires all paths within that profile,
serializes with its accounting writer and stops below 8 GiB free space.

```sh
"$APP/Contents/Helpers/node" \
  "$APP/Contents/Resources/engine/saved-history-cli.mjs" compact \
  --db "$PROFILE/observations.sqlite" \
  --evidence "$PROFILE/accounting-evidence" \
  --accounting "$PROFILE/accounting-checkpoint.json" --offline --vacuum
```

Before an older app is launched, run the same command with `expand` in place of
`compact`, using the **newer helper**. Inspect its success/skipped counts and retain
the current state. Expansion reconstructs current original bytes, including any
observations recorded after an upgrade; restoring an old backup would lose them.
Interrupted maintenance can be resumed with the same command. Conflicting/corrupt
copies stop conversion and remain preserved for diagnosis.
