# Build reliability

Owner-approved on 11 October 2026: isolate Node startup hooks, verify installed
dependencies before tests, and record the native toolchain in package provenance.
This promotes the three corresponding roadmap findings. Financial validation
and early balance publication remain separate work.

## Contract

- Builder subprocesses remove inherited `NODE_OPTIONS` and `NODE_PATH`, including
  the runtime validator, locked dependency installation and both Node smoke checks.
  Other required environment settings continue to work; the parent is unchanged.
- Portable preflight reads the lockfile and installed package metadata before
  running engine tests. Missing, malformed or mismatched dependencies stop with
  the explicit locked-install remedy. This proves metadata consistency, not
  cryptographic integrity of every installed file; packaging still installs afresh.
- New provenance records compiler, Xcode build and macOS SDK version/build values
  from the toolchain actually used by the builder. Only validated identifiers are
  serialized, never executable paths, arbitrary command output or personal data.
  Older artifact provenance remains valid; existing artifacts are not rewritten.
- No app-data migration, installed-app replacement, Developer ID operation or
  hosted private CI. Build a separate local verification artifact; retain the
  installed candidate and its original installers.

## Proof and ordering

Use synthetic failure cases first: inherited startup hooks, missing/stale
transitive dependencies and malformed toolchain output. Verify valid inputs still
work, the parent environment survives, and untrusted text cannot enter provenance.
Run focused Python checks, the complete local preflight, and one independent review.
Commit before packaging because the builder exports committed source. Exercise the
real builder with a harmless injected hook and inspect the resulting provenance,
signatures, executable slices and archive privacy. Update milestone evidence only
after those checks succeed.

Rollback is a source revert and rebuilding a local artifact. Keep retained
installers and all personal runtime data unchanged. The current local SDK is the
build authority; older SDK, minimum-OS and Intel hardware validation remain explicit
release boundaries. Neither toolchain metadata nor these tests prove byte-for-byte
reproducibility or a secure developer machine.

## Source verification

All 701 local tests passed: 179 Swift, 455 engine and 67 Python. The ten new
guards cover actual Node child environments, valid/path-bearing toolchain metadata
and missing/stale/malformed direct, transitive and nested dependency metadata.
The actual nine installed packages match the lock. A focused independent review
found no P0/P1 blocker.

The first packaging rehearsal exposed an incorrect compiler override: SwiftPM
needs `swiftc`, while the initial override selected the `swift` command driver.
The correction selects the compiler from the same toolchain. A real temporary
SwiftPM executable build/run test reproduced the failure before the fix and
passes afterward; a focused independent recheck confirms the correction and
matching compiler identifiers. No artifact was published by the failed attempt.

Deferred P2: extra nested dependencies can shadow lock-listed packages; the guard
does not scan extraneous packages or attest module resolution. Reinstalling with
`npm ci --ignore-scripts --prefix engine` remains the remedy. This is separate
from the implemented name/version checks and is tracked in the roadmap.

## Packaging verification

The corrected builder passed a complete Apple-silicon-only packaging rehearsal
from source `f3cfd0bc0401c45594923f532cc13428811951f1`. The separate local
verification ZIP has SHA-256
`1f0893731c4b942a9e02f639e00c9993b0d1673b1a840602d2f58fd4893ae5d7`.
It was not installed or uploaded.

- A harmless `NODE_OPTIONS` preload and ambient `NODE_PATH` were supplied to the
  builder. No preload marker appeared through runtime validation, fresh locked
  npm installation and packaged Node smoke checks. A separate positive control
  proved the supplied hook executes when filtering is absent.
- Release compilation passed with warnings as errors. Extracted app and Node
  binaries are arm64, and the extracted app's deep/strict ad-hoc signature passes.
  Archive checksum, source/index/reachable-history privacy and ZIP privacy pass.
- ZIP provenance identifies the exact source above, Xcode 26.2 build 17C52,
  Swift 6.2.3 (swiftlang 6.2.3.3.21, clang 1700.6.3.2), and macOS SDK 26.2
  build 25C57. No native toolchain paths are serialized.
- The retained universal ZIP and DMG, installed app executable and installed
  Info.plist match their before-build SHA-256 values. No app profile or history
  data was read or modified by this rehearsal; the installed candidate is still
  the earlier universal 0.2.28 build 30.

This proves the current Apple silicon packaging path. It does not add Intel
execution, minimum-OS, older-SDK or Developer ID/notarization evidence.
