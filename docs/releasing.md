# Releasing

This repository is a private alpha. Version 0.2.39 (build 42) supports local
universal app packaging for Apple silicon and Intel, in a ZIP and a
drag-to-Applications DMG. Verified 0.2.39 delivery covers the arm64 ZIP;
universal/DMG packaging remains a build capability, not current artifact proof.
There is no GitHub Release or public download. Building an artifact or passing
checks does not authorize publication.

[Current status](current-status.md) records the installed source revision,
artifact hashes and local upgrade/login-item evidence. Older review documents
are historical checks, not claims of complete current-platform certification.

Public publication requires the owner's explicit final green light after
brand-asset permissions and the release gates are resolved. Do not change
repository visibility, upload an artifact, enable Pages, notarize, or add
scheduled/automatic publishing as part of routine development.

## Build a local candidate

From a reviewed checkout with Swift 6, Python 3.12+, the macOS developer tools,
and Node.js 26.7.0, run the checks, then commit the reviewed candidate. Packaging
requires clean tracked files and builds only the committed `HEAD`:

```sh
npm ci --ignore-scripts --prefix engine
python3 scripts/check.py
```

After committing the reviewed changes:

```sh
NODE_ARM64="$(python3 scripts/fetch-node-runtime.py --arch arm64)"
NODE_INTEL="$(python3 scripts/fetch-node-runtime.py --arch x64)"
python3 scripts/build-local-app.py --node-runtime "$NODE_ARM64" \
  --intel-node-runtime "$NODE_INTEL" --universal --dmg
python3 scripts/check-privacy.py --history --archive dist/GODL-Monitor-0.2.39-universal.zip
```

The builder exports the committed source and freshly installs the locked
production engine dependencies using the verified Node/npm runtime with lifecycle
scripts disabled. It never copies local dependency folders, ignored resources or
untracked files. Inherited Node startup/module-path hooks are removed from builder
children. Source commit, lockfile checksum and validated native compiler/Xcode/SDK
identifiers are recorded in the bundle, without personal paths. Compilation uses
the selected compiler and SDK; version metadata is not a reproducibility guarantee.
It validates both official Node runtimes, compiles both Swift targets
with warnings as errors, combines the executable slices, ad-hoc signs the app,
checks its signature, and runs the bundled engine on the build host. It scans
the ZIP before promoting it to the final filename. Nothing is uploaded.

Expected outputs for the universal/DMG command above:

```text
dist/GODL-Monitor-0.2.39-universal.zip
dist/GODL-Monitor-0.2.39-universal.zip.sha256
dist/GODL-Monitor-0.2.39-universal.dmg
dist/GODL-Monitor-0.2.39-universal.dmg.sha256
```

The disk image contains only the app, an Applications shortcut and a short
installation guide. Check each SHA-256 sidecar against its artifact. Mount the
DMG read-only, verify that its app matches the scanned ZIP byte-for-byte, then
eject it. The build does not change an installed app or copy personal data.

## Privacy review before publication

Use a complete clone and fetch the branches/tags intended for publication before
running `--history`. The check examines every reachable commit's file content
and paths, commit metadata/messages, and annotated tag messages, as well as the
current index and working source. It refuses shallow history. Removing a file
from HEAD does not erase an earlier committed copy.

For the maintainer's local review, compare known private wallet/derived-account
identifiers, RPC URLs/keys and home paths using `PRIVATE_SCAN_VALUES` loaded in
memory by a local wrapper. Never type secrets into a command line, save them in
the repository, or upload scanner inputs. The normal scan also checks known
runtime filenames, personal home paths, credential-bearing URLs, key material
and unreviewed account literals. These patterns are useful checks, not a general
proof that no arbitrary secret exists.

Review screenshot pixels and embedded metadata, including historical versions;
review commit attribution and GitHub issues, pull requests, releases, artifacts,
and other enabled public surfaces. GitHub no-reply email does not hide the
account or author name. Verify the final ZIP, mounted DMG and source revision;
record exact artifact hashes privately before requesting publication.

## Signing and installation

Current candidates use **ad-hoc signing**. They are not Developer ID signed or
Apple notarized. macOS may block a transferred/downloaded candidate. This is a
private test path, not the final community installation experience.

The intended public experience is a Developer ID signed, notarized app inside a
notarized DMG, with the appropriate tickets stapled and Gatekeeper acceptance
checked on a clean Mac. A separate [signing handoff](notarization.md) now provides
a read-only candidate preview and an explicitly authorized execution path.
Its tests and local ad-hoc rehearsal do not prove Apple acceptance: real
Developer ID credentials, authorization and end-to-end validation remain open.
An Apple Development certificate is not a substitute for Developer ID
distribution signing. Review the certificate's public identity before use.

Follow Apple's [distribution packaging](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
and [notarization guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
The [recipient guide](getting-started.md) documents installation, first run,
updates and the private alpha's current limitations.

## Candidate validation

| Boundary | Current evidence | Still required before community release |
| --- | --- | --- |
| Architectures | Earlier universal candidates: Swift arm64 and x86_64 compilation and both app/Node slices; current 0.2.39 delivery: arm64 | Native Intel launch and core journeys |
| Runtime | Pinned official Node checksums, system-only Node dependencies, packaged engine/SQLite execution on Apple silicon | Clean Macs without development tools |
| macOS | App target 14.0; Node target 13.5; local installed upgrade and use on Apple silicon/macOS 27 | Lowest supported macOS, native Intel and clean current-macOS installation/usage |
| Packaging | Current 0.2.39 arm64 ZIP: local signature, privacy scan and checksum; earlier candidates have read-only DMG validation | Developer ID signing, notarization and Gatekeeper acceptance |
| Personal data | Generic package; synthetic documentation images; existing profiles stay outside the app | Repeat privacy review for exact release artifacts |

Cross-compilation and static architecture inspection are not evidence of Intel
execution. Keep that distinction visible until an Intel Mac has been tested.
Hosted checks must actually execute on the candidate revision; queued or
billing-blocked jobs do not count as passing evidence.

The [isolated first-run review](first-run-review.md) records local 0.2.13 setup,
provider failure, wallet-switch isolation, compact setup and unsupported-settings
checks on Apple silicon. Its test identity and temporary profile do not establish
clean installation, Gatekeeper, notification permission or launch-at-login behavior.

Before requesting publication, exercise on clean Apple silicon and Intel Macs:

1. DMG open, drag to Applications, eject, launch, first-run public-address setup,
   and quit/reopen, without Node or Xcode installed.
2. The full window and 360×600 widget, resize/maximize, wallet switching on
   relaunch, and state preservation across an app replacement.
3. Balance refresh, unavailable/stale/error states, current quotes, goal pinning
   and scrolling, all three goal styles, notification permission and delivery.
   Include physical sleep/wake with idle and in-flight helpers, delayed network
   recovery, and quitting after wake. Cached history must remain intact; resumed
   checks must not overlap another helper of the same kind.
4. A wallet without an anchor: balances, recorded rewards and gross values work;
   unsupported net values remain explicitly unavailable.
5. ZIP/DMG contents and runtime provenance: no wallet, RPC endpoint, private
   history, accounting evidence, contributor path or build cache.
6. Launch at login: explicit enable, macOS approval/denial, sign-out/sign-in,
   disable, external preference changes and replacement of the installed app.
   Confirm only the installed copy opens and prior data remains intact. Local
   fake-service tests do not substitute for these OS lifecycle checks.
7. Open two updated copies against the same local profile: only the first starts
   monitoring; the second shows recovery guidance. Quit the first, allow owned
   helpers to finish, and reopen. Repeat after force-quitting the test app; its
   data must remain intact. Quit older builds before this check.

## Remaining public-release gates

- Re-run the portable synthetic accounting journeys on the exact candidate;
  see [covered scenarios and limits](../engine/test-fixtures/README.md).
- Validate reviewed-anchor preparation and the Settings import journey with a
  community wallet. The local importer checks consistency, not historical truth;
  balance monitoring works without it and verified profit history is not automatic.
- Resolve GODL artwork redistribution permission.
- Complete Developer ID signing, notarization and clean-machine validation on
  both architectures and the documented macOS range.
- Obtain the owner's final approval of the exact source revision and visibility.

## Publication boundary

There is no scheduled release process. After explicit approval, record the exact
approved source revision and perform only the separately authorized signing,
notarization, artifact and visibility steps. Until then, keep the repository
private and describe builds as local alpha candidates. No automatic updater or
cloud history transfer is included.
