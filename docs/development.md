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

Use Swift 6 with macOS developer tools, Python 3.12 or later, and the pinned
Node.js 26.7.0 toolchain. Install the engine lockfile without dependency lifecycle
scripts:

```sh
npm ci --ignore-scripts --prefix engine
```

Do not add wallet addresses, private RPC endpoints, real balances, accounting evidence, or local paths to fixtures, logs, screenshots, or commits.

## Run checks

```sh
swift test -Xswiftc -warnings-as-errors
npm test --prefix engine
python3 scripts/test-node-runtime.py
python3 scripts/test-package.py
python3 scripts/test-privacy.py
python3 scripts/check-privacy.py
```

The privacy checker is a required repository gate. Use only generated synthetic values when a test or screenshot needs wallet-like data.

## Build the runnable app

`swift build` is useful for compilation, but the runnable app expects its packaged engine and embedded Node runtime. Build the complete local bundle instead:

```sh
NODE_ARM64="$(python3 scripts/fetch-node-runtime.py --arch arm64)"
NODE_INTEL="$(python3 scripts/fetch-node-runtime.py --arch x64)"
python3 scripts/build-local-app.py --node-runtime "$NODE_ARM64" \
  --intel-node-runtime "$NODE_INTEL" --universal --dmg
```

The fetcher pins official Node 26.7.0 archives by architecture, verifies checksums,
LICENSE and provenance, and caches them outside the repository. It inspects a
foreign runtime without executing it, so cross-building on Apple silicon does
not require Rosetta. The builder compiles both Swift targets and combines both
the app and runtime into universal executables. It rejects unexpected native
Node add-ons and runtimes requiring a newer macOS than the app's declared minimum.

Outputs for the current candidate:

```text
dist/GODL-Monitor-0.2.7-universal.dmg
dist/GODL-Monitor-0.2.7-universal.dmg.sha256
dist/GODL-Monitor-0.2.7-universal.zip
dist/GODL-Monitor-0.2.7-universal.zip.sha256
```

The DMG contains the app, an Applications shortcut and a short setup guide. All
outputs stay local. They are ad-hoc signed, not Developer ID signed or notarized.
The builder checks signatures, runs the packaged engine on the host, and scans
the ZIP for private material. Intel compilation and static inspection do not
replace a launch test on Intel hardware. See [release validation](releasing.md).

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
