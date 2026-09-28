# Releasing

This repository is a private alpha. It has no GitHub Release artifact, and the current supported path is a local source build. Merging code, passing checks, or producing a ZIP does not authorize publication.

Public publication requires the owner's explicit final green light after brand-asset permissions and the release gates are resolved. Do not change repository visibility, upload an artifact, enable Pages, notarize, or add scheduled/automatic publishing as part of routine development.

## Local candidate build

From a clean, reviewed checkout on an Apple Silicon Mac:

```sh
npm ci --ignore-scripts --prefix engine
swift test -Xswiftc -warnings-as-errors
npm test --prefix engine
python3 scripts/check-privacy.py
NODE_RUNTIME="$(python3 scripts/fetch-node-runtime.py)"
python3 scripts/build-local-app.py --node-runtime "$NODE_RUNTIME"
python3 scripts/check-privacy.py --archive dist/GODL-Monitor-local.zip
```

The build script validates the pinned official Node 26.7.0 runtime, compiles with warnings as errors, ad-hoc signs the app, verifies the local signature, and writes:

```text
dist/GODL-Monitor-local.zip
```

That ZIP is a local candidate only. Ad-hoc signing is not Apple Developer ID signing or notarization.

## Candidate review

Before asking the owner for a publication decision:

1. Confirm the Swift, engine, and privacy checks pass on the exact candidate source.
2. Extract the ZIP and exercise first-run setup, wallet switching on relaunch, the full window, and the 360×600 widget.
3. Verify balance refresh, stale/error states, goal pinning and scrolling, all three goal styles, notification permission and test delivery, and quit behavior.
4. Confirm a wallet without an anchor shows accounting-only values as unavailable while balances and goals still work.
5. Inspect the archive for wallet addresses, RPC endpoints, personal reports, accounting evidence, local paths, and bundled build caches.
6. Reconfirm platform support, license terms, third-party notices, brand permissions, signing, notarization, and distribution wording.

## Publication boundary

There is deliberately no scheduled release process. If the owner approves a public release, record the exact approved source revision and complete the separately authorized signing, notarization, artifact, and repository-visibility steps. Until then, keep distribution private and describe all builds as source-built local alpha candidates.

## Remaining public-release gates

- Replace the private captured-history regression cases with synthetic accounting
  journeys before widening distribution; see [portable coverage](../engine/test-fixtures/README.md).
- Provide a reviewed accounting-anchor onboarding path for community wallets.
  Balance monitoring works already; verified profit history is not automatic.
- Resolve GODL artwork redistribution permission and complete Developer ID signing
  and notarization for downloadable builds.
- Validate the documented Apple Silicon/macOS range on clean machines. Intel is
  not supported by the current bundled runtime.
- Obtain the owner's final approval of the exact source revision and visibility.
