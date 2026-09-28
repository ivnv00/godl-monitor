<p align="center">
  <img src="docs/images/wordmark.png" alt="GODL Monitor" width="360">
</p>

<p align="center">
  Your GODL rewards, balances and goals. One native Mac app.
</p>

<p align="center">
  Apple silicon + Intel · macOS 14+ · Read-only · MIT source
</p>

> [!IMPORTANT]
> **Private alpha — not publicly released.** A self-contained universal app, ZIP and DMG can be built locally. There is no GitHub download yet. Current candidates are ad-hoc signed, not Apple notarized; Intel hardware and clean-Mac validation remain release gates. Publication and brand-asset permissions require final owner review. See [release status](docs/releasing.md).

<p align="center">
  <img src="docs/images/widget-roadmap.png" alt="Menu-bar widget showing recorded rewards, pending net earnings, balances and a roadmap goal — fictional data" width="360">
</p>
<p align="center"><sub>Actual native views. All pictured financial data is fictional.</sub></p>

GODL Monitor observes a public Solana address. It never connects to your wallet,
signs transactions, claims rewards or controls mining. Close the window and the
menu-bar monitor keeps running.

## On another Mac

The intended installation is deliberately small:

1. Open the supplied **GODL Monitor DMG**.
2. Drag **GODL Monitor** into **Applications**, then eject the DMG.
3. Open the app, paste a **public Solana address**, and choose **Start monitoring**.

The app contains its runtime and dependencies. Recipients do **not** need Terminal,
Node.js, Python, Xcode, a GitHub account, or wallet credentials. One universal app
contains native Apple silicon and Intel executables. Use macOS 14 or later;
older macOS versions are not supported.

Until signing and notarization are complete, macOS may block a privately supplied
candidate. Follow the [installation guide](docs/getting-started.md); never disable
Gatekeeper system-wide. The local builder does not upload or publicly distribute
artifacts. A separate maintainer signing workflow requires explicit approval.

## What you can see

![Overview with recorded rewards, daily history and scoped gain/loss — synthetic data](docs/images/overview.png)

- **Balances:** unrefined GODL, refined GODL and gold, with current USD estimates.
- **Recorded rewards:** the increases observed today, before fees and costs.
- **Verified net:** a separate figure when reward and cost history supports it;
  clear pending and unavailable states otherwise.
- **Goals:** five metrics, three visual styles, and your choice of widget pins.
- **Activity and alerts:** meaningful accruals and balance movements, plus a
  persistent notification inbox for catching up.

![Activity with recorded rewards and an explicit pending-net status — synthetic data](docs/images/activity.png)

Balances refresh about every 30 seconds while the app and Mac are awake. Quitting
or sleep pauses monitoring; waking the Mac requests fresh data automatically.
Catch-up intervals are observations, not a fabricated
transaction-by-transaction or complete-day history.

<details>
<summary>Goal styles and first-run setup</summary>

![Roadmap, Ring and Bar goal styles — synthetic data](docs/images/goal-styles.png)

Create several goals and choose a style for each. A single pinned goal stays
fixed; multiple pinned goals share a bounded scrolling area in the widget.

<p align="center"><img src="docs/images/setup.png" alt="First-run public-address setup" width="560"></p>

</details>

## Your address stays out of the download

The generic app contains no user's wallet address, RPC key or history. A new Mac
starts with its own setup and local data. Public Solana RPC is the default; an
optional personal endpoint can help with shared rate limits. Follow the
[Helius setup tutorial](docs/getting-started.md#optional-helius-or-another-rpc-provider)
to use your own key. There is no automatic cloud sync or history transfer.
See [privacy and local data](docs/privacy.md).

Net cost, daily net and cumulative gain/loss require a separately reviewed,
wallet-specific accounting anchor, imported through **Settings → Set up accounting**.
The app checks file consistency; preparing and reviewing the historical basis
remains an expert task. It never creates a zero-cost baseline.
Recorded rewards and current gross holding values work without that anchor.
Cumulative gain/loss is deliberately limited to verified unrefined GODL, not
whole-wallet profit. Read [accounting and coverage](docs/accounting.md).

## Build a private candidate

Developers need Swift 6 with macOS developer tools, Python 3.12+, Node.js 26.7.0 and
npm. These tools are only needed on the build Mac.
Packaging requires a clean committed checkout; it installs fresh locked
dependencies and excludes untracked/ignored local files.

```sh
git clone git@github.com:ivnv00/godl-monitor.git
cd godl-monitor
npm ci --ignore-scripts --prefix engine
python3 scripts/check.py
NODE_ARM64="$(python3 scripts/fetch-node-runtime.py --arch arm64)"
NODE_INTEL="$(python3 scripts/fetch-node-runtime.py --arch x64)"
python3 scripts/build-local-app.py --node-runtime "$NODE_ARM64" \
  --intel-node-runtime "$NODE_INTEL" --universal --dmg
```

This produces a versioned universal ZIP and DMG in `dist/`, each with a SHA-256
sidecar. No release or upload is created. See [development](docs/development.md)
for tests and the smaller Apple-silicon-only build.

## Documentation

For contributors: [Architecture](docs/architecture.md) · [Changelog](CHANGELOG.md) · [Roadmap](docs/roadmap.md).

| Start here | Understand the numbers | Contribute |
| --- | --- | --- |
| [Install and set up](docs/getting-started.md) | [Accounting and coverage](docs/accounting.md) | [Development](docs/development.md) |
| [Privacy and local data](docs/privacy.md) | [Missing values and recorded rewards](docs/earnings-availability.md) | [Contributing](CONTRIBUTING.md) |
| [Release status](docs/releasing.md) | [Activity behavior](docs/activity-review.md) | [Security policy](SECURITY.md) |

Source code is [MIT licensed](LICENSE). Artwork has a separate rights boundary;
see [NOTICE](NOTICE) and [image provenance](docs/images/README.md).
GODL Monitor is an unofficial community project, not affiliated with or endorsed
by GODL Supply.
