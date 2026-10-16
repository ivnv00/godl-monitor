# Source and local-machine closeout — 17 October 2026

The owner requested source commit/push, current documentation and continuity,
storage/process cleanup and quitting the app. This is private source maintenance,
not authorization for a release, visibility change, artifact upload or Apple
submission.

## Completed local work

- [x] Reconcile current build/version references, schema-2 storage architecture,
  changelog and roadmap. Keep dated milestone measurements as historical proof.
- [x] Retain installed 0.2.39 build 42, app-source
  `2bfd15fbc148c0e380bee8d565056ad5a64f0a4c`, with its matching current arm64 ZIP.
- [x] Quit the app and verify its native/helper processes exited. Leave the
  existing launch-at-login preference as configured; recording and notifications
  remain paused until the next launch.
- [x] Verify every live profile file against a fresh stopped recovery copy.
- [x] Losslessly archive unique older state, sources, receipts and diagnostics;
  verify original file bytes and hardlink/symlink references before removal.
- [x] Remove obsolete app/test bundles, duplicate installers, Swift outputs,
  downloaded build runtimes, local dependencies and Python bytecode caches.
- [x] Recheck the current signature, installer checksum, profile integrity and
  single-installation/process state after cleanup.

## Preserved data and custody

All **33,784 live profile files** (181,432,979 bytes) match the stopped recovery
copy and remained unchanged after cleanup. They contain **49,412 observations**,
**381 journal entries**, settings, exact verified midnight opening and complete
accounting evidence. SQLite integrity passes. The hot tier contains 10,000
observations, packed tail 244 and 153 cold blocks containing 39,168 originals;
one dictionary remains. No observation, accounting evidence, read state or
unknown accounting boundary was pruned or reset.

The private historical archive preserves **55,532 files/references**, representing
5,356,171,971 original logical bytes, in 611,465,754 compressed bytes. Every
regular file's SHA-256/length matches; 33,983 hardlink references match an earlier
verified target, and symlink targets are preserved. Original snapshots, unique
source and receipts remain recoverable with their relative directory structure.
The first verifier's repeated gzip seeks were stopped before any originals were
removed; a complete single streaming pass supplied the accepted proof.

Only regenerable app executables and app-only installers were excluded from
historical preservation; their hashes and provenance remain recorded. The cleanup
removed **36 obsolete app/test bundles** and 27 loose historical work folders,
after preserving their unique contents. Targeted LaunchServices unregistration
was applied to old paths, and the single canonical app was registered.
No loose historical app bundles remain. Installed-app and helper processes were
absent after cleanup.
The final registry-driven scan also found five old temporary test-app folders.
Their twenty remaining source/resource files and references were verified in a
separate 18,007-byte archive before removal. Native registry garbage collection
completed after targeted unregistration; no application-data or preference reset
was performed.
The final scan found only the canonical app as an existing GODL registration
target and no remaining test bundles in GODL-named temporary roots. macOS still
caches some references to nonexistent historical paths; these have no app files
or running processes. The system registry was not rebuilt to erase that metadata.

The private work root fell from approximately **13 GB to 1.1 GB**. The removal
phase increased measured free space by **8.49 GB**, after creating recovery
archives; this is an observed phase delta, not a claim that summed file sizes
equal physically reclaimed APFS blocks. Historical September recovery/source
archives and original design handoffs remain preserved. The live profile and
current installed app are required data, not disposable cache content.

The private custody index is the current location/restore authority. It points
to one current installer, the fresh complete profile copy, verified historical
archive and manifests. Old loose backup paths in dated plans and Nous milestones
now require extracting the corresponding historical record first. Reinstalling
the retained current app does not require replacing user data. Never restore an
old database over newer observations. Older codec readers require the newer
helper to expand **all current** history and referenced response records first.

## Source validation and transfer boundary

The final application source is unchanged from the passing **865-test** gate:
206 Swift, 592 engine and 67 Python tests, with warnings as errors. The subsequent
changes are documentation only. Current package proof covers 367 matching files,
strict ad-hoc signing, checksum and privacy; the installed and packaged helper
also preserve the complete parsed 10,000-point view. Documentation links,
source/index/history/package privacy and clean-diff checks are the closeout gates.

Source history retains logical implementation and verification commits, followed
by documentation and closeout batches. The authorized destination is the existing
private repository's `main`; exact remote-head and privacy readback belong in
the private transfer receipt and Nous after the push. No history rewrite or
public artifact publication is part of this closeout. GitHub had no open issues
or pull requests at this reconciliation. Hosted checks deliberately skip while
the repository is private, so skipped jobs are not executed test evidence.

Developer ID/notarization, artwork rights, native Intel, clean-Mac/minimum-macOS
and OS lifecycle gates remain open. The hour's sampling gap, late RSS increase,
full Metal/shared WindowServer limits and unmeasured week-long behavior remain
explicit in the [resource report](version-038-resource-validation.md) and
[roadmap](../roadmap.md). A calendar week with the app closed is not a week of
running-resource evidence.
