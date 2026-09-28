# Privacy and local data

GODL Monitor is a read-only observer. It never asks for a recovery phrase or private key and has no signing, claiming, swapping, or mining-control capability.

## Data sent over the network

- Your public Solana address and derived public account addresses are sent to the configured Solana RPC provider.
- The public Solana mainnet RPC is used by default.
- With a custom provider, the full RPC endpoint and its API key are sent to that
  provider over HTTPS. Providers also receive ordinary connection information
  such as the client's IP address. This is not anonymous/offline monitoring.
- Current GODL and XAUt0 market quotes are requested from DEX Screener. Quote requests identify token mints, not your wallet address.
- Accounting, when enabled with a reviewed anchor, retrieves finalized public chain history and historical market evidence.

A public wallet address is not a secret, but it can reveal balances and transaction activity. Choose an RPC provider whose privacy terms you accept.

## Data kept on this Mac

Application state lives under:

```text
~/Library/Application Support/GODL Monitor/
```

It can include the selected public address, goals, observations, cached quotes, notification history, and—when explicitly provided—accounting anchors, checkpoints, and evidence. New wallet profiles are isolated under:

```text
~/Library/Application Support/GODL Monitor/Wallets/<public-address>/
```

Existing personal installations keep their original profile at the root during local upgrade. The app does not copy that history into new wallet profiles.

## Private RPC setting

The optional HTTPS RPC endpoint is entered through a `SecureField`, which obscures it on screen. It is saved to a local file with owner-only permissions (`0600`). It is **not** stored in Keychain or encrypted at rest. An endpoint can contain an API key in its query string, so treat the file and backups as sensitive.

The app keeps this RPC setting outside the distributable bundle and redacts endpoints from ordinary error messages. Raw accounting evidence can still contain public transaction data and provider responses, so do not attach the application-support directory to an issue.

Each user supplies their own endpoint if they choose one. No maintainer API key
or wallet profile belongs in the source, screenshots, installer or Git history.
See [provider setup](getting-started.md#optional-helius-or-another-rpc-provider).

## What making the repository public exposes

Publishing exposes tracked files, reachable commit history and attribution,
documentation images, and any uploaded release artifacts. Removing a file from
the latest version alone does not remove it from history. The GitHub account and
commit author name remain visible; GitHub no-reply attribution protects the
author's email address, not their identity.

Public protocol program IDs and token mint addresses are required constants in
the source. They identify the protocol, not the maintainer's personal wallet.

Before publication, run the [source, history and artifact checks](releasing.md)
on the exact candidate and review image pixels/metadata and GitHub surfaces.
These are bounded checks for known private identifiers and suspicious patterns,
not a guarantee that arbitrary secrets or personal information can never appear.

## Reports and screenshots

Window lifecycle diagnostics stay in the macOS unified log. They record close,
minimize, focus and resize events, visibility flags and window dimensions, without
wallets, balances, endpoints or screen contents. The app does not upload them.
See [Window and history stability](stability-review.md) for local inspection.

Before sharing a bug report, log excerpt, or screenshot, remove:

- wallet addresses and derived account addresses;
- RPC URLs, API keys, query strings, and provider identifiers;
- balances, costs, goals, and transaction signatures;
- accounting anchors, evidence, and local filesystem paths.

Use synthetic replacement values. The repository's screenshots and fixtures must also remain synthetic.

## Removing local data

Quit GODL Monitor before moving its application-support folder to the Trash. That removes local settings and history for every profile; it does not affect the public wallet or anything on-chain. Keep a private backup first if you need accounting evidence or history later.
