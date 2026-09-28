<p align="center">
  <img src="docs/images/wordmark.png" alt="GODL Monitor" width="360">
</p>

<p align="center">
  A community-built, unofficial, read-only GODL monitor for Apple Silicon Macs.
</p>

> [!IMPORTANT]
> This repository is a private alpha. There is no downloadable release yet; access currently means building from source. Public release and brand-asset permissions remain subject to the owner's final review. Source code is licensed under [MIT](LICENSE); see [NOTICE](NOTICE) for third-party assets.

<p align="center">
  <img src="docs/images/widget-roadmap.png" alt="Native GODL Monitor roadmap widget — synthetic demo" width="360">
</p>

<p align="center"><sub>Native app views with synthetic demonstration data.</sub></p>

GODL Monitor keeps balances, rewards, goals, and carefully scoped accounting close at hand in a native macOS window and menu-bar widget. It observes a public Solana address. It cannot connect a wallet, sign transactions, claim rewards, or control mining.

| Monitor | Goals | Local history | Notifications |
| --- | --- | --- | --- |
| Unrefined GODL, refined GODL, gold rewards, and current quote values | Roadmap, Ring, or Bar for each goal | Separate profiles for each wallet, stored on this Mac | Reward alerts continue after the window closes while the app remains running |
| Fresh balance checks every 30 seconds | Five metrics: unrefined, refined, gold, claimable value, and today's net | Public Solana RPC by default; optional private HTTPS RPC | No updates while the Mac sleeps, and quitting stops monitoring |

## Take a quick tour

![Roadmap, Ring, and Bar goal styles](docs/images/goal-styles.png)

Create several goals, choose a style for each, and pin your favorites to the widget.

<details>
<summary>See first-run setup</summary>

<p align="center"><img src="docs/images/setup.png" alt="Public wallet setup" width="560"></p>

Enter only a public Solana address. No recovery phrase or private key is needed.

</details>

## Build the private alpha

You need an Apple Silicon Mac running macOS 14 or newer, Swift 6, Python 3, and Node.js 26.7.0 with npm.

```sh
git clone git@github.com:ivnv00/godl-monitor.git
cd godl-monitor
npm ci --ignore-scripts --prefix engine
NODE_RUNTIME="$(python3 scripts/fetch-node-runtime.py)"
python3 scripts/build-local-app.py --node-runtime "$NODE_RUNTIME"
open dist/GODL-Monitor-local.zip
```

Archive Utility extracts `GODL Monitor.app` beside the ZIP. Open that locally built app from Finder. The package is ad-hoc signed for local use and is not Apple notarized. Do not disable Gatekeeper system-wide.

See [Getting started](docs/getting-started.md) for setup and first-run details.

## Accounting has an explicit trust boundary

Balances, current-price gross holdings, goals, and notifications work without accounting history. Net cost, today's net value, and cumulative gain/loss require a separately verified, wallet-specific accounting anchor. The app does not invent or automatically bootstrap one for a new wallet.

Daily accounting covers only the verified interval shown; it is not a full-day rate or extrapolation. Cumulative gain/loss is limited to attributed unrefined GODL and excludes refined GODL, gold, unknown opening holdings, and other stated costs. Read [Accounting and coverage](docs/accounting.md) before interpreting those figures.

## Documentation

- [Getting started](docs/getting-started.md)
- [Privacy and local data](docs/privacy.md)
- [Accounting and coverage](docs/accounting.md)
- [Development](docs/development.md)
- [Release process](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

GODL Monitor is an unofficial community project and is not affiliated with or endorsed by GODL Supply.
