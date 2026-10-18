# Development

GODL Monitor is a Swift 6 package with a read-only Node.js observation and accounting engine.

```text
Sources/GODLCore/       Models, validation, goals, and presentation logic
Sources/GODLMonitor/    Native SwiftUI app, menu-bar widget, and notifications
engine/                 Read-only Solana observation and accounting engine
scripts/                Runtime fetching, packaging, and privacy checks
Tests/GODLCoreTests/    Native unit tests
```

Read `AGENTS.md` and `design.md` before changing behavior or interface code. The full window and 360×600 widget share the Warm Ledger system and both need checking after UI changes.

## Install dependencies

Use **full Xcode** with Swift 6, Python 3.12 or later, and the pinned
Node.js version in `.nvmrc` (currently 26.7.0). Command Line Tools alone are not
enough for the packaging script, which records `xcodebuild -version` and the
selected macOS SDK. The current tested toolchain is Xcode 27.0 / Swift 6.4;
older SDK builds remain unverified. You do not need Apple Developer membership,
a signing certificate, a wallet or an RPC key to build or run tests.

Install [Xcode](https://developer.apple.com/xcode/), open it once to complete its
setup, then select that Xcode in **Xcode → Settings → Locations → Command Line
Tools**. Install [Python](https://www.python.org/downloads/macos/) if your
`python3` is older than 3.12, and use the exact Node version in `.nvmrc` from
[Node.js](https://nodejs.org/en/download/archive/v26.7.0). Verify:

```sh
xcodebuild -version
swift --version
python3 --version
node --version
npm --version
```

Clone with Git, rather than downloading GitHub's source ZIP: packaging requires
a committed `HEAD` and full history is needed for the sharing privacy scan.
The repository is public; HTTPS cloning needs no GitHub account.

```sh
git clone https://github.com/ivnv00/godl-monitor.git
cd godl-monitor
```

If you use nvm, run `nvm install`
and `nvm use` from the repository root. Install the engine lockfile without dependency lifecycle
scripts:

```sh
npm ci --ignore-scripts --prefix engine
```

Do not add wallet addresses, private RPC endpoints, real balances, accounting evidence, or local paths to fixtures, logs, screenshots, or commits.

## Run checks

```sh
python3 scripts/check.py
```

The command verifies the Node pin in `.nvmrc`, `engine/package.json` and its
lockfile, and checks installed package names/versions against that lock before
engine tests. Missing or stale direct/transitive packages stop with the locked
install command above; manifest changes require updating the lock first. This
metadata check does not authenticate installed file contents, scan extra packages,
or implement general npm resolution. Linked, optional and platform-conditioned
entries require a reviewed extension to the current plain npm v3 contract.
The command also scans tracked and new non-ignored files for private material; checks
local Markdown/image links; runs engine and Python guard tests; and builds/tests
Swift with warnings as errors. It does not install dependencies, call live RPC,
read application-support data, launch the monitor, or publish anything.

Public CI uses the same command split into `--suite native` (macOS
Swift tests) and `--suite portable` (engine, Python, docs and privacy). All hosted
jobs skip while the repository is private to avoid runner charges; run preflight
locally. Portable checks also run on Linux. The `native` job uses Apple silicon;
`native-intel` adds native Intel Swift tests. Both verify the runner's actual
architecture before testing. See [contribution checks](contribution-checks.md)
for permissions, costs, and the limits of that evidence.
External URLs, Markdown anchor targets, native UI and installer behavior
remain manual checks. Source images still need a visual privacy review: a text
scanner cannot inspect their pixels.

For a focused change, run the relevant test directly; use the complete preflight
at the commit/review boundary. All test fixtures must be synthetic. The privacy
scanner checks both the Git index and working-tree content, including new
non-ignored files before staging and force-added ignored files. Ordinary ignored
local data stays outside the source boundary. Partially staged private content
and staged symlinks are rejected even if the working copy has been replaced.
Before a visibility change or release, also run `python3 scripts/check-privacy.py
--history` from a complete clone. This includes deleted historical files and
commit/tag messages; see the [release privacy review](releasing.md).

### Dependency and workflow updates

`.nvmrc` is the Node pin used by CI and the official-runtime fetcher. A Node
upgrade also requires matching package/lockfile engine metadata and freshly
verified archive checksums in `fetch-node-runtime.py`. Derive the Node binary,
complete npm tree and LICENSE hashes from those verified official archives for
both architectures. Cached Node/npm bytes are authenticated before execution;
cache metadata alone is not trusted. Never remove those integrity checks to make
a new version pass. Install dependencies
with lifecycle scripts disabled and review lockfile changes.

Run `npm audit --omit=dev --prefix engine` when reviewing dependencies; it needs
network access and is not a substitute for code review. There is deliberately
no automatic dependency merge, release, or upload. GitHub Actions are pinned to
commits from their official repositories, have read-only contents permission,
and do not retain checkout credentials. Verify the upstream origin and release
when updating a pin, following [GitHub's guidance](https://docs.github.com/en/actions/reference/security/secure-use).

Public CI and branch protection are enabled. The three required checks are
`native`, `native-intel` and `engine`; all must pass before a pull request can
merge into an up-to-date `main`. See [contribution checks](contribution-checks.md)
and the [public launch record](plans/public-source-launch.md). Historical private
runs skipped or blocked by billing are not passing test evidence. Hosted unit
tests do not establish packaged-app or clean-Mac compatibility.

## Build the runnable app

Use the current local Xcode/SDK for development. The deployment target (`macOS 14`
in `Package.swift`) is the oldest intended runtime, not a requirement to build with
an old SDK. Minimum-OS testing remains a separate compatibility check. The
17 October release compilation used Xcode 27.0 / Swift 6.4.

`swift build` is useful for compilation, but the runnable app expects its packaged engine and embedded Node runtime. Build the complete local bundle instead:

Commit the reviewed changes first. Packaging requires a clean tracked Git state
and exports that exact `HEAD` into a temporary build directory. Untracked or
ignored files are never build inputs. The builder installs fresh locked
production dependencies there with the verified runtime's Node/npm and lifecycle
scripts disabled; it never copies the developer's `engine/node_modules`.
Internet access to the package registry is needed when dependencies are not cached.

```sh
NODE_ARM64="$(python3 scripts/fetch-node-runtime.py --arch arm64)"
NODE_INTEL="$(python3 scripts/fetch-node-runtime.py --arch x64)"
python3 scripts/build-local-app.py --node-runtime "$NODE_ARM64" \
  --intel-node-runtime "$NODE_INTEL" --universal --dmg
```

The fetcher pins official Node 26.7.0 archives by architecture, verifies checksums,
Node/npm contents, LICENSE and provenance, and caches them outside the repository. It inspects a
foreign runtime without executing it, so cross-building on Apple silicon does
not require Rosetta. The builder compiles both Swift targets and combines both
the app and runtime into universal executables. It rejects unexpected native
Node add-ons and runtimes requiring a newer macOS than the app's declared minimum.

Expected outputs when building the 0.2.40 (build 43) source-sharing candidate
with the universal/DMG command above:

```text
dist/GODL-Monitor-0.2.40-universal.dmg
dist/GODL-Monitor-0.2.40-universal.dmg.sha256
dist/GODL-Monitor-0.2.40-universal.zip
dist/GODL-Monitor-0.2.40-universal.zip.sha256
```

The DMG contains the app, an Applications shortcut and a short setup guide. All
outputs stay local. They are ad-hoc signed, not Developer ID signed or notarized.
Builder children remove inherited `NODE_OPTIONS` and `NODE_PATH`, including runtime
validation, npm installation and smoke checks. Other environment settings remain;
this is not a sandbox for an untrusted build machine.
Bundled provenance records the source commit and package-lock checksum alongside
the Node runtime checksums and architectures. New packages also record Swift,
compiler build, Xcode and macOS SDK version/build identifiers. The builder resolves
Swift and the SDK through `xcrun` and pins those selections during compilation;
only validated identifiers, never compiler/SDK paths, enter `nativeToolchain`.
Earlier artifact provenance remains valid and is not rewritten. These identifiers
improve traceability without claiming byte-for-byte reproducibility.
The builder checks signatures, runs the packaged engine on the host, and scans
the ZIP for private material. Intel compilation and static inspection do not
replace a launch test on Intel hardware. See [release validation](releasing.md).

The source-sharing path ends with this local ad-hoc build. Developer ID signing
and notarization are not planned. The separate [signing handoff](notarization.md)
is retained only as an optional future maintainer workflow and is never invoked
by the builder, preflight or CI.

For a smaller Apple-silicon-only candidate, omit `--universal` and
`--intel-node-runtime`; the original `dist/GODL-Monitor-local.zip` name remains:

```sh
NODE_ARM64="$(python3 scripts/fetch-node-runtime.py --arch arm64)"
python3 scripts/build-local-app.py --node-runtime "$NODE_ARM64"
```

`--install` installs into the builder's user Applications directory only when no
app exists there. It deliberately refuses to replace a running or existing app.
For updates, quit the installed app and use the normal replacement flow. Neither
packaging mode copies Application Support data into the bundle.

Open the generated DMG and drag the app into Applications, or extract the ZIP
and move its app there. Continue with [first run](getting-started.md#first-run).
For updates, commit your changes, run the checks and build again; do not replace
your private Application Support folder. See [update and removal](getting-started.md#update).

## Behavioral invariants

- Observation remains read-only; never add secrets, signing, claims, or mining controls.
- Unknown balances, prices, costs, and coverage remain unknown.
- Wallet profiles stay isolated and existing local files are preserved on upgrade or parse failure.
- Exact decimal and integer math remains authoritative for progress and monetary values.
- A new wallet never receives an inferred accounting anchor.
- Closing a window does not quit the menu-bar app; quitting or sleep stops live updates.

See [Accounting and coverage](accounting.md) for the data boundary and [Contributing](../CONTRIBUTING.md) for pull-request expectations.

The [window and history stability review](stability-review.md) records the resize,
window recovery and malformed-history regression cases and their remaining limits.

The [Activity review](activity-review.md) records the meaningful-event ledger,
its precision and unknown-data checks, and its remaining display limitation.

### Sleep and wake recovery

`MonitorRefreshLifecycle` gates the observation and accounting channels separately.
The controller listens on the workspace notification center for Apple's
[will-sleep](https://developer.apple.com/documentation/appkit/nsworkspace/willsleepnotification)
and [did-wake](https://developer.apple.com/documentation/appkit/nsworkspace/didwakenotification)
notifications. It holds no sleep assertion and does not terminate a helper merely
because the Mac is sleeping. Normal helper deadlines remain in effect.

Five focused lifecycle tests cover both channels, active work, repeated events,
completion during sleep, ordinary retry and terminal shutdown. A local native
integration check also compiled the production controller into an isolated app,
posted these workspace notifications and used gated synthetic Node helpers.
It verified suppressed launches during sleep, immediate wake attempts, one
follow-up after failed/in-flight work, and no relaunch from late shutdown
callbacks. No personal profile or live RPC was used.

That check simulates notifications and helper completion on Apple silicon/macOS
27; it does not put a physical Mac to sleep or prove OS notification delivery,
network reconnection, Intel behavior or macOS 14 compatibility. Test those journeys
on the supported clean machines before release.
