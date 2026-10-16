# Long-term history without accounting regressions

Owner promoted a further reduction on 16 October 2026. Preserve every original
record and accounting result; do not prune, downsample, infer missing amounts or
change mining/wallet behavior. Keep private data and trials outside the repository.

## Checklist

- [x] Measure real duplication and identify all readers/writers.
- [x] Independently review accounting, corruption and downgrade risks.
- [x] Store repeated raw response tokens once, with exact original envelopes.
- [x] Keep reference metadata compact and profile-local; bound reconstructed reads.
- [x] Compress cold snapshot rows in bounded independent blocks while retaining
  the complete recent window, exact slot lookup and accounting selection.
- [ ] Prove complete original-byte inventories and current/old-week projections
  on synthetic fixtures and private consistent copies, including expansion.
- [ ] Test interruption, corruption, conflicts, profile isolation, forensic reads
  and zero-RPC warm caches; independently review implementation.
- [ ] Run required gates, package/install locally with protected state and verify
  window/widget, fresh observations, actual footprint and measured growth.

## Evidence and interfaces

The prior gzip format retains 31,983 response records but only 5,893 distinct raw
bodies. Serialized raw tokens occupy 98.58% of original response bytes. Lossless
raw-token/envelope deduplication projects about 90% less evidence storage before
filesystem overhead. Whole-record deduplication alone misses differing envelopes.

The evidence codec still returns complete original serialized bytes, including
whitespace, escapes, unsafe integer digits, request IDs, provenance and timestamps.
A profile-local SQLite archive retains immutable body objects, compressed exact
envelopes and logical-path mappings. Full record and object SHA-256/length checks
bound and verify reconstruction. JSON parse source tokens locate an exact reusable
string slice; malformed/unsupported originals use a whole-byte object. No parsed
numeric value is reserialized. Reconciliation, committed markers and settings
retain their existing paths and plain format.

Legacy-visible versioned references prevent old cache readers from treating retained
records as missing. Shared immutable reference markers avoid a separate 4 KiB data
allocation per logical record; link groups stay bounded. Missing archive components
are integrity errors, never ENOENT cache misses. Explicit export/expansion restores
original self-contained records. Unknown formats and conflicting originals are
preserved. No online garbage collection is introduced.

Observation schema 2 groups at most 256 old rows and bounded original bytes into
independent compressed blocks with separate selection metadata. The original slot,
accounts hash and JSON survive exactly. Keep 10,000 recent hot rows and a bounded
small packed tail. Recent reads choose indexed keys before decoding payloads;
archived corruption cannot block unrelated current observations. Exact old-slot
lookup and accounting selection use block ranges/metadata and validate complete
selected snapshots. Older binaries reject the new storage version explicitly.

## Ordering and rollback

Stage on generated data, then private copies. Serialize evidence conversion with
the existing accounting writer lock. Commit objects and complete mappings before
publishing durable references; verify reconstruction before removing unchanged
originals. Each interrupted step remains resumable. Preserve a consistent current
DB/state backup, a verified evidence representation and the prior app before local
installation. Verify complete inventories and account projections before removing
only duplicate conversion representations.

A downgrade requires the newer helper to expand **all current** snapshots and
records, including data recorded after upgrade. Never restore an older database
over newer history. A moved/copied reference needs its profile archive; expansion
provides original portable evidence files. No public release or publishing approval
is granted by this storage work.

## Acceptance proof

Compare every original snapshot and evidence byte/hash before, after and after
expansion. Cover old/new schemas, duplicate/conflict/u64 order, multi-wallet/network
isolation, read-only nonmutation, all closed/funded historical boundaries, timezone/
DST, claim CLI parity and current publication. Inject missing/corrupt archives and
interruption at transaction/publication boundaries; corruption must not fetch or
replace saved cache data. Measure physical allocation, logical bytes, bounded hot
rows/dictionaries/blocks, recent lookup decode counts and a representative long-run
synthetic growth rate. Unique irreducible evidence necessarily grows; report the
measured rate rather than promise a fixed total ceiling.

## Implementation review

The independent implementation pass found two P1 downgrade gaps: a mapping
committed just before a crash could lack its physical marker, and new 64–128 MiB
records could exceed the expansion limit. Writer retries now heal missing
markers, and offline maintenance enumerates committed mappings as well as files,
including recovery of missing run directories. Oversized new records retain
their original portable plaintext representation; offline expansion reports them
skipped without changing their bytes. The focused independent recheck passed six
affected-journey tests with no remaining P0/P1. Missing archived objects block
reconciliation without detail RPC; original receipts remain preserved.

The first-readable-form online writer can leave a conflicting secondary legacy
gzip intact; offline conversion detects and preserves both. This is a deferred
P2, rather than a reason to replace either original. No online collection deletes
archive objects. Full expansion intentionally retains the shared archive until
the operator has verified the restored portable evidence.
