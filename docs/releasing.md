# Releasing

The distribution model is **source sharing with local builds**. On 18 October
2026 the owner chose not to use Developer ID signing or Apple notarization.
Neither is required to share the source or build locally. The app remains an
alpha; there is no official binary download or automatic updater.

The owner approved public source sharing at `0e0a0ae` on 18 October 2026.
[Publication and repository controls](plans/public-source-launch.md) record the
verified state. Source publication does not authorize a binary release, Pages,
announcement or automatic publishing.
The owner confirmed permission to include the existing GODL artwork in shared
source on 18 October 2026; preserve [NOTICE](../NOTICE), which excludes that
artwork from the source-code MIT grant.

[Current status](current-status.md) records the installed baseline separately
from source-sharing work. [The sharing review](plans/source-sharing.md) records
this preparation's evidence and remaining publication steps. Historical reports
retain their dated results; they are not current platform certification.

## Source-sharing acceptance

Before presenting a source revision for approval:

1. Run the complete local preflight, dependency audit, source/index/history
   privacy checks and an independent security review. Resolve confirmed
   security, data-loss and core-journey blockers.
2. Follow the documented clone/build path from clean committed source. Verify
   the bundled engine, both executable slices for a universal build, signatures,
   ZIP/DMG checksums, privacy and matching mounted-image contents.
3. Review current and historical image pixels/metadata and intentional public
   Git attribution. Keep private scan inputs and accounting evidence outside
   the repository and artifacts.
4. Make prerequisites, first run, updates, contributions, security reporting,
   third-party rights and known platform/accounting limits clear.
5. Obtain the owner's final approval for the exact source revision and sharing
   destination. Source approval does not authorize uploading binary artifacts.

Native Intel, minimum-macOS and clean-machine checks below remain compatibility
work. They must stay visible, but do not prevent sharing an honestly labelled
source-build alpha. A source release must not advertise them as passed.

## Build a local candidate

From a reviewed checkout with full Xcode and Swift 6, Python 3.12+,
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
python3 scripts/check-privacy.py --history --archive dist/GODL-Monitor-0.2.40-universal.zip
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
dist/GODL-Monitor-0.2.40-universal.zip
dist/GODL-Monitor-0.2.40-universal.zip.sha256
dist/GODL-Monitor-0.2.40-universal.dmg
dist/GODL-Monitor-0.2.40-universal.dmg.sha256
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

Local builds use **ad-hoc signing**, which supplies a local integrity signature,
not a verified developer identity or Apple malware assessment. No Developer ID
certificate, Apple Developer membership or notarization submission is required.
The builder never contacts Apple's notarization service.

Follow the [installation guide](getting-started.md) for local setup and Apple's
per-app security prompt. Never disable Gatekeeper system-wide or remove
quarantine as a standard installation step. Building from source does not make
unreviewed source or dependencies inherently trustworthy.

The [signing handoff](notarization.md) is retained as optional future maintainer
work. It requires a new explicit owner decision and exact-candidate approval;
it is outside this source-sharing path.

## Candidate validation

| Boundary | Current evidence | Unverified compatibility or future binary-distribution work |
| --- | --- | --- |
| Architectures | Universal source builds compile Swift arm64/x86_64 and verify both app/Node slices; installed 0.2.39 is arm64 | Native Intel launch and core journeys |
| Runtime | Pinned official Node checksums, system-only Node dependencies, packaged engine/SQLite execution on Apple silicon | Clean Macs without development tools |
| macOS | App target 14.0; Node target 13.5; local installed upgrade and use on Apple silicon/macOS 27 | Lowest supported macOS, native Intel and clean current-macOS installation/usage |
| Packaging | Local ad-hoc ZIP/DMG path; exact current verification is in the sharing review | Downloaded-app Gatekeeper behavior; no Developer ID/notarization is planned |
| Personal data | Generic package; synthetic documentation images; existing profiles stay outside the app | Repeat privacy review for exact release artifacts |

Cross-compilation and static architecture inspection are not evidence of Intel
execution. Keep that distinction visible until an Intel Mac has been tested.
Hosted checks must actually execute on the candidate revision; queued or
billing-blocked jobs do not count as passing evidence.

The [isolated first-run review](first-run-review.md) records local 0.2.13 setup,
provider failure, wallet-switch isolation, compact setup and unsupported-settings
checks on Apple silicon. Its test identity and temporary profile do not establish
clean installation, Gatekeeper, notification permission or launch-at-login behavior.

Before claiming full packaged-app platform support, exercise on clean Apple silicon and Intel Macs:

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

## Remaining compatibility and onboarding work

- Re-run the portable synthetic accounting journeys on each changed candidate;
  see [covered scenarios and limits](../engine/test-fixtures/README.md).
- Validate reviewed-anchor preparation and the Settings import journey with a
  community wallet before claiming effortless accounting onboarding. The local
  importer checks consistency, not historical truth. Balance monitoring works
  without an anchor; verified profit history is not automatic.
- Complete the native Intel, minimum-macOS, clean-Mac and OS lifecycle checks
  above before expanding compatibility claims.
- Keep the [resource and product backlog](roadmap.md) explicit. No week-long
  resource guarantee or whole-wallet profit figure is established.

## Publication boundary

There is no scheduled release process or binary release. The owner approved only
public source sharing at `0e0a0ae` and the security-reporting, CI and protection
setup. Future binary uploads, Pages, announcements or automatic publishing still
require a separate explicit owner decision.

Private Vulnerability Reporting is enabled; use [SECURITY.md](../SECURITY.md).
Public CI and protected-branch settings are recorded in
[contribution checks](contribution-checks.md#maintainer-setup-after-approved-public-launch)
and the [publication record](plans/public-source-launch.md). Keep required check
names and settings synchronized when workflows change. If the repository ever
becomes private, its jobs deliberately skip to avoid runner charges; skipped jobs
are not executed-test evidence.
