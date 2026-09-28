# Install and set up

GODL Monitor is a private alpha. There is no public download yet. The steps below
apply to a local candidate supplied privately by the maintainer; developers can
[build their own](development.md).

## What your Mac needs

- Apple silicon **or Intel**, with macOS 14 or later
- Internet access to a Solana RPC provider and current market quotes
- A public Solana address to observe

The universal app includes both CPU architectures and its Node runtime. You do
not need Terminal, Node, Python, Xcode or a GitHub account to run it. Intel
cross-compilation is checked; execution on a physical Intel Mac and clean-machine
coverage across supported macOS versions remain pre-release checks.

## Install the supplied app

1. Open the **GODL Monitor `.dmg`**.
2. Drag **GODL Monitor.app** onto **Applications**.
3. Eject the disk image. Open **GODL Monitor** from Applications.

If you received a ZIP instead, double-click it and move the extracted app to
Applications. Do not launch multiple copies from Downloads and Applications.

Current private candidates are ad-hoc signed and **not Apple notarized**. If
macOS cannot verify the developer, first confirm that the candidate came from
the maintainer you trust. Apple's supported per-app flow is **System Settings →
Privacy & Security → Open Anyway** after trying to open the app. Do not turn off
Gatekeeper, remove quarantine in Terminal, or bypass a malware/damaged-app alert.
If the expected per-app option is unavailable, stop and ask the maintainer for a
properly signed candidate. See [Apple's opening guidance](https://support.apple.com/102445).

For verification, a `.sha256` sidecar accompanies each ZIP/DMG. Developers can
check the downloaded file with `shasum -a 256 -c <filename>.sha256` from its folder.
A matching checksum checks file integrity; it does not replace signing or trust
in the source of the checksum.

## First run

![Public wallet setup](images/setup.png)

1. Paste a **public Solana address**.
2. Select **Start monitoring**.
3. Allow macOS notification access if you want reward alerts.

Never enter a recovery phrase, private key or signing credential. The app has no
wallet-connect or transaction-signing flow. A valid address with no GODL miner
account is not an app failure; its observed state will reflect that account's
availability.

The main window provides Overview, Activity, Goals, Strategy and Settings. The
GODL menu-bar icon opens the quick overview. Closing a window leaves the app
running; **Quit GODL** stops it. Monitoring pauses while the Mac sleeps.

## Read the summary

- **Recorded today** values the increases saved within today's observation
  intervals, before fees and mining costs. Overnight intervals are not guessed
  into a daily total.
- **Verified net** uses separately reconciled reward and cost history. “Awaiting
  settlement” or “No verified history” is not zero earnings.
- A dash in an accrual row means no increase was recorded for that asset in that
  interval. It is not a zero balance.
- Hover amounts for exact units and current USD estimates. Missing/expired prices
  leave token quantities visible.

New installations can monitor balances, recorded rewards, goals and alerts
without an accounting anchor. They do not automatically inherit the maintainer's
cost basis or history. See [Accounting and coverage](accounting.md).

## Goals

Choose Unrefined GODL, Refined GODL, Gold, Claimable value or Today's net, then
select Roadmap, Ring or Bar. Pin favorites with **Show in widget**. One pinned
goal has a fixed layout; several goals scroll within their shared section.

Claimable value needs complete balances and fresh quotes. Today's net also needs
verified accounting history.

## Optional private RPC

The public Solana mainnet RPC is the default. If it is rate-limited or unreliable,
open Settings → **Private RPC** and enter your own HTTPS endpoint. A Helius
endpoint is optional; no API key is included in the app.

The field is obscured and the file has owner-only permissions, but it is not
stored in Keychain or encrypted at rest. Never include it in a bug report. Read
[Privacy and local data](privacy.md).

## Another Mac or another wallet

Installing the app on another Mac starts a new local profile. Enter the same
public address if you want to observe the same wallet. Re-enter any optional RPC
privately. **History, goals, read states and accounting evidence are not synced
or bundled with the app.** There is no in-app import/export yet; keep the old Mac's
private data if you need it and arrange a separate, reviewed migration.

To change wallets on one Mac, save the public address in Settings, quit and
reopen. Wallets keep isolated profiles. Unreadable or unsupported settings are
preserved rather than overwritten.

## Update

Quit GODL, replace the app in Applications with the newer supplied copy, and
reopen it. App updates leave the separate Application Support data in place.
Keep a private backup before testing an alpha update. There is no automatic
updater yet.
