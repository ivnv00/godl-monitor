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

Use the pinned Node.js 26.7.0 toolchain and install the engine lockfile without dependency lifecycle scripts:

```sh
npm ci --ignore-scripts --prefix engine
```

Do not add wallet addresses, private RPC endpoints, real balances, accounting evidence, or local paths to fixtures, logs, screenshots, or commits.

## Run checks

```sh
swift test -Xswiftc -warnings-as-errors
npm test --prefix engine
python3 scripts/check-privacy.py
```

The privacy checker is a required repository gate. Use only generated synthetic values when a test or screenshot needs wallet-like data.

## Build the runnable app

`swift build` is useful for compilation, but the runnable app expects its packaged engine and embedded Node runtime. Build the complete local bundle instead:

```sh
NODE_RUNTIME="$(python3 scripts/fetch-node-runtime.py)"
python3 scripts/build-local-app.py --node-runtime "$NODE_RUNTIME"
```

The runtime fetcher downloads the pinned official Apple Silicon Node 26.7.0 archive, verifies its checksum and provenance, and caches it outside the repository. The builder validates that runtime again before packaging.

The output is `dist/GODL-Monitor-local.zip`. It is a local, ad-hoc-signed build and is not a public release or Apple-notarized artifact.

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
