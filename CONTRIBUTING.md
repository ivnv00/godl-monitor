# Contributing

GODL Monitor is currently developed as a private alpha. Contributions should keep the app read-only, preserve local data, and make unavailable values explicit.

## Before you start

- Read `AGENTS.md`, `design.md`, and the relevant source and tests.
- Keep a change bounded to one behavior or documentation concern.
- Do not add real wallet addresses, RPC endpoints, balances, transaction history, accounting evidence, private design links, or machine-specific paths.
- Use generated synthetic fixtures and screenshots.
- Do not publish releases, change repository visibility, or add automatic publishing. Those steps require the owner's explicit final approval.
- Original source is MIT licensed. GODL brand-asset permissions remain under review; do not change third-party license claims as part of an unrelated contribution.

## Development checks

Install the locked engine dependencies:

```sh
npm ci --ignore-scripts --prefix engine
```

Run the repository gates before opening a pull request:

```sh
swift test -Xswiftc -warnings-as-errors
npm test --prefix engine
python3 scripts/check-privacy.py
```

For UI changes, also inspect the full window and the 360×600 menu-bar widget. Check reduced motion, keyboard focus, VoiceOver labels, stale and unavailable states, long content, and multiple pinned goals.

## Pull requests

Describe the behavior change and why it is needed. Include the checks you ran and any limits that remain. Keep accounting coverage precise: never present partial-day data as a daily rate, infer a cost basis, or replace unknown values with zero.

Before attaching logs or screenshots, redact wallet and derived addresses, RPC URLs and API keys, balances, transaction signatures, accounting data, and local paths. Prefer a minimal synthetic reproduction.

Use the repository pull-request template. A merge is not authorization to publish an app or repository.
