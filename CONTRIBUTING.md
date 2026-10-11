# Contributing

GODL Monitor is currently developed as a private alpha. Contributions should keep the app read-only, preserve local data, and make unavailable values explicit.

No paid GitHub plan, Apple Developer membership, wallet, or Helius key is needed
to contribute or run the tests. Private repository access still requires an
invitation. After an approved public launch, anyone can fork the source and
propose a pull request. See [contribution checks and CI](docs/contribution-checks.md)
for the workflow, free options, and what a check result means.

## Before you start

- Read `AGENTS.md`, `design.md`, and the relevant source and tests.
- Keep a change bounded to one behavior or documentation concern.
- Do not add real wallet addresses, RPC endpoints, balances, transaction history, accounting evidence, private design links, or machine-specific paths.
- Use generated synthetic fixtures and screenshots.
- Do not publish releases, change repository visibility, or add automatic publishing. Those steps require the owner's explicit final approval.
- Original source is MIT licensed. GODL brand-asset permissions remain under review; do not change third-party license claims as part of an unrelated contribution.

## Development checks

Use Swift 6, Python 3.12+ and the Node version in `.nvmrc`. If you already use
nvm, `nvm install` followed by `nvm use` selects the pin; nvm itself is optional.
The [development guide](docs/development.md) covers the complete build setup.

```sh
npm ci --ignore-scripts --prefix engine
python3 scripts/check.py
```

The complete preflight runs engine, Python and Swift tests, checks Node-version
consistency and local documentation links, and scans source privacy. It requires
macOS. Linux contributors can run `python3 scripts/check.py --suite portable`,
but must state that native validation is still outstanding. The tests use
synthetic data and need no wallet address, RPC key or accounting archive.

Follow `.editorconfig` and the surrounding code. Avoid unrelated reformatting,
generated build products and lockfile churn. Read [Architecture](docs/architecture.md)
for the data boundaries and [Roadmap](docs/roadmap.md) before widening scope.

For UI changes, also inspect the full window and the 360×600 menu-bar widget. Check reduced motion, keyboard focus, VoiceOver labels, stale and unavailable states, long content, and multiple pinned goals.

## Pull requests

Describe the behavior change and why it is needed. Include the checks you ran and any limits that remain. Keep accounting coverage precise: never present partial-day data as a daily rate, infer a cost basis, or replace unknown values with zero.

Before attaching logs or screenshots, redact wallet and derived addresses, RPC URLs and API keys, balances, transaction signatures, accounting data, and local paths. Prefer a minimal synthetic reproduction.

Update [CHANGELOG.md](CHANGELOG.md) for user-facing changes. Use the repository pull-request template. A merge is not authorization to publish an app or repository.

## Maintainer review

Review behavior, evidence and privacy before merging. A passing local run is
useful evidence, but it does not stand in for hosted required checks once those
are enabled. While the repository is private, every hosted job is deliberately
skipped to avoid runner charges; contributors run the local preflight. `main`
still has no branch protection. See [current status](docs/current-status.md) for
dated evidence; a successful workflow with skipped jobs is not passing tests.
Until merge protection is configured, maintainers must review and verify checks;
there is no enforced merge gate or automatic release. The
[maintainer checklist](docs/contribution-checks.md#maintainer-setup-after-approved-public-launch)
describes the eventual public checks and protection setup; it does not change
repository settings.

Use **Bug report** for a reproducible defect and **Feature request** for a useful
outcome. Be specific and respectful, assume good intent, and discuss the change
rather than the contributor. Security concerns follow [SECURITY.md](SECURITY.md).
