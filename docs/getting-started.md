# Getting started

GODL Monitor is currently a private, source-build alpha for Apple Silicon Macs. No GitHub Release artifact is available.

## Requirements

- Apple Silicon Mac
- macOS 14 or newer
- Swift 6 and the macOS command-line developer tools
- Node.js 26.7.0 with npm
- Python 3
- Network access to install engine dependencies and fetch the verified Node runtime

Check the local tools before building:

```sh
swift --version
node --version
npm --version
python3 --version
```

The Node version should be `v26.7.0`. The packaging script embeds a separately fetched and verified Apple Silicon Node 26.7.0 runtime in the app.

## Build from source

Clone the private repository using your normal GitHub authentication. The repository does not require wallet credentials or other private values.

```sh
git clone git@github.com:ivnv00/godl-monitor.git
cd godl-monitor
npm ci --ignore-scripts --prefix engine
NODE_RUNTIME="$(python3 scripts/fetch-node-runtime.py)"
python3 scripts/build-local-app.py --node-runtime "$NODE_RUNTIME"
```

The final command validates the fetched runtime, compiles the Swift package in release mode, ad-hoc signs the local app, verifies the signature, and writes:

```text
dist/GODL-Monitor-local.zip
```

To extract it with Archive Utility:

```sh
open dist/GODL-Monitor-local.zip
```

Open the extracted `GODL Monitor.app` from Finder. This source build is ad-hoc signed and is not Apple notarized. Do not disable Gatekeeper system-wide. If macOS rejects the app, confirm that you built the current source yourself and inspect the local signature with:

```sh
codesign --verify --deep --strict "dist/GODL Monitor.app"
```

## First run

1. Enter a **public Solana address** in the setup screen.
2. Select **Start monitoring**.
3. Allow notification access only if you want macOS reward alerts.

Never enter a recovery phrase, private key, or signing credential. GODL Monitor has no wallet-connect or transaction-signing flow.

The app checks balances about every 30 seconds. Accounting reconciliation runs every 5 minutes only when a separately reviewed accounting anchor exists. Closing the main window leaves the menu-bar app and notifications running. Quitting the app stops updates; sleep also pauses them.

## Goals

Each goal has its own metric and visual style:

- Metrics: Unrefined GODL, Refined GODL, Gold, Claimable value, or Today's net
- Styles: Roadmap, Ring, or Bar

Pin goals with **Show in widget**. Pinned goals appear in a scrollable section, so you can keep more than one without crowding the widget.

Claimable value needs complete balances and fresh market quotes. Today's net also needs verified accounting history; see [Accounting and coverage](accounting.md).

## Change wallets

Open Settings, enter another public address, and save it. The new wallet becomes active the next time the app launches. Each newly selected wallet receives an isolated local profile under `Wallets/<public-address>/`.

An existing personal installation upgrades in place: its original profile remains at the application-support root, while additional wallets use isolated subdirectories. The app preserves unreadable or unsupported settings rather than overwriting them.

## Optional private RPC

The default is the public Solana mainnet RPC. In Settings, expand **Private RPC** to save a custom HTTPS endpoint. The entry field is obscured on screen, and the file is written with owner-only permissions (`0600`), but the value is stored locally as a file rather than in Keychain. See [Privacy and local data](privacy.md).
