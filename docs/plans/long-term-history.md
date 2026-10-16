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
- [x] Prove complete original-byte inventories and current/old-week projections
  on synthetic fixtures and private consistent copies, including expansion.
- [x] Test interruption, corruption, conflicts, profile isolation, forensic reads
  and zero-RPC warm caches; independently review implementation.
- [x] Run required gates, package/install locally with protected state and verify
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

## Installed result

Local 0.2.37 build 40 is installed from app source
`65bcc312a25b5ccd78ca5f332aaa6e68a1ed8fb6`. All 855 tests pass: 206 Swift,
582 engine and 67 Python. Release warnings-as-errors, thirteen package tests,
privacy, strict ad-hoc signatures and all 367 installed/package files pass.
The packaged helper also compacted and expanded 10,256 generated observations
and exact original response bytes. The prior installed reader explicitly rejects
schema 2. No push, public release or notarization was performed.

The private trial preserved all 33,509 original evidence files, representing
2,214,914,912 expanded bytes, through full conversion and portable expansion.
All 48,510 original-format and 48,627 per-row-format observations retained their
complete tuple hashes, latest/recent views and all three seven-day windows of
closed/funded accounting selection. All integrity checks passed; zero files were
skipped. A compacted copy was preserved before expansion to avoid repeating the
one-time durable file conversion.

At installation all 48,694 current observations, 377 journal entries and thirteen
state files survived. Five static settings remain unchanged after launch, while
fresh finalized observations and derived daily coverage resume normally. Both
window and compact widget, Activity, goal, older week and return to today were
checked. The installed database measured 47,296,512 bytes; evidence measured
131,405,117 unique-inode file bytes (137,396,224 allocated bytes, counting shared
marker inodes once). Combined saved history is about 178.70 MB, versus roughly
1.327 GB previously. This excludes app binaries, derived caches and private
rollback copies. No original history was deleted.

A separate smaller private archive backup was checked against all original file
lengths and SHA-256 hashes before duplicate conversion/expansion representations
were removed. Original manifests, current state/database backups, the previous
app and installer remain private. An old app must still use the newer helper to
expand all current data before downgrade; the shared archive accompanies copied
references until portable expansion is complete.

## Growth evidence and limits

The real trial's cold blocks and their SQLite indexes used 5,017,600 bytes for
38,400 observations: about 130.67 bytes each. At a constant fifteen-second cadence
that extrapolates to about 0.753 MB/day or 275 MB/year of additional cold snapshot
data, plus a bounded recent window. This is a measured data mix, not a universal
future rate. Whole-database vacuum stays offline; normal refresh compacts at most
128 old rows and one bounded block after publication.

A generated repeated-body trial retained one body for 2,000 logical records.
After bootstrap, another path for an identical whole record added about 107
SQLite bytes; a different original envelope with the same body added about 528
bytes. Shared marker groups prevent a separate 4 KiB data allocation per path;
link groups stay at most 1,024 links and roll over safely. Directory entries and
new unique bodies still consume space. Actual unique-body payload averaged about
17.25 KB in the private trial. Exact evidence cannot have a fixed lifetime ceiling
without dropping unique data; growth remains dependent on real activity, while
repeated bulk responses no longer multiply the stored payload.

## Runtime and cleanup check

The installed 0.2.37 process completed a 120-second sample after window/widget
navigation. All nine saved-view checkpoints were current. File descriptors stayed
at 64; RSS ended around 139 MiB versus 162 MiB initially (range 134–162 MiB).
CPU-time delta was 1.69 seconds, about 1.41% of one core. Sampled helpers were
transient, at most one per sample, with a roughly 361 MiB peak. This is a finite
smoke check, alongside the earlier dated GPU/hour-long evidence, rather than a
claim of universal future leak freedom.

Seven generated duplicate representation trees were removed after installed and
backup byte checks, representing 5.325 GB of logical file bytes. APFS copy-on-write
sharing means that figure is not the physical space reclaimed. The compact
archive backup, consistent database/state backups, original manifests, previous
app and current installer remain. All trial, conversion and sample processes
exited; no diagnostic recorder or persistent profiler was introduced.
