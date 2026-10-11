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

All 700 local tests passed: 179 Swift, 455 engine and 66 Python. The nine new
guards cover actual Node child environments, valid/path-bearing toolchain metadata
and missing/stale/malformed direct, transitive and nested dependency metadata.
The actual nine installed packages match the lock. A focused independent review
found no P0/P1 blocker.

Deferred P2: extra nested dependencies can shadow lock-listed packages; the guard
does not scan extraneous packages or attest module resolution. Reinstalling with
`npm ci --ignore-scripts --prefix engine` remains the remedy. This is separate
from the implemented name/version checks and is tracked in the roadmap.

The real local packaging rehearsal follows the source commit; no successful
artifact proof is claimed until that run completes. It uses the separate
Apple-silicon-only ZIP so the installed universal candidate and its original
installers retain their provenance and bytes.
