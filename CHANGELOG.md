# Changelog

All notable user-facing changes to GODL Monitor are recorded here. Every version
below is a private local alpha candidate; none represents a public release.

## Unreleased

- Resume balance and configured accounting checks promptly after system wake.
  In-flight helpers receive at most one queued wake follow-up each; sleep and
  shutdown prevent new helper launches. Cached history and accounting rules
  remain unchanged. Physical sleep/wake coverage across supported Macs is pending.

- Prepared native Intel CI for an eventual public repository, with explicit
  architecture checks and a contributor guide covering free checks, fork PRs,
  and maintainer setup. Intel CI remains unexecuted during the private alpha.

- Prevented two updated app copies from opening the same local data concurrently.
  Duplicate launches stop before profile access, and active helpers retain data
  ownership if the app exits first. Old versions must be quit before upgrading.

- Added optional Launch at login in Settings, with actual macOS status, approval
  and recovery actions, serialized changes and a privacy-safe diagnostics field.
  Real login/logout and installed-app replacement validation remain release checks.
- Observation and accounting failures now use fixed recovery messages instead
  of raw provider output or historical checkpoint error text.

- Private RPC setup now checks Mainnet connectivity before saving, with cancellation,
  credential-safe errors and preservation of the previous endpoint on failure.

- Added review-before-copy support diagnostics in Settings and full-window setup,
  with app health statuses and no wallet, endpoint, key, balance or raw-log data.
- Prepared a separate, preview-first Developer ID/notarization handoff with
  pinned inputs, narrow Node permissions and failed-attempt preservation.
  Actual Apple signing/notarization and clean-Mac validation remain pending.
- Added a Settings flow to review and import a wallet-specific accounting starting
  point, with exact cost values, local checks and protection against replacing
  existing history. Historical basis still needs separate expert review.
- Added portable synthetic accounting journeys for reconciliation, restart,
  provider failure, checkpoint persistence and earnings-chain validation.
- Fixed repeated finalized observations creating duplicate accounting checkpoints
  that could make verified earnings unavailable.
- Added full-history privacy checking and an optional Helius setup tutorial,
  with provider limits, troubleshooting and the distinction from accounting setup.
- Package only committed source and freshly installed locked dependencies,
  excluding stray developer files and recording source/lock provenance.
- Added a shared contributor/CI preflight, checked Node pin, local documentation
  link checks, and privacy scanning for both staged content and new source files.
- Added architecture and roadmap references, release history, clearer issue/PR
  forms, and pinned CI actions with read-only permissions.

- Public launch remains gated by signing, notarization, platform validation,
  portable accounting coverage, artwork permission, repository controls, and
  final owner approval. See the [roadmap](docs/roadmap.md).

## 0.2.7

- Added a self-contained universal Mac candidate with Apple silicon and Intel
  app and Node runtime slices.
- Added versioned ZIP and drag-to-Applications DMG outputs, SHA-256 sidecars,
  runtime provenance checks, and package privacy validation.
- Clarified private installation, platform coverage, and public-release gates.

## 0.2.6

- Separated recorded rewards from verified net earnings across Overview,
  Activity, charts, and the menu-bar widget.
- Added a precise recorded-today summary with explicit gap, quote, and
  cross-midnight handling while keeping unavailable net values unavailable.

## 0.2.5

- Removed unnecessary scrolling for a single widget goal and nested goal
  scrolling in the full window.
- Kept bounded scrolling for multiple widget goals and size-based bounce for
  genuinely overflowing content.

## 0.2.4

- Made GODL and gold denominations consistent across balances, goals, earnings,
  reward details, activity, and notification history.
- Added shared native amount presentation while preserving exact accessible
  quantities and existing accounting behavior.

## 0.2.3

- Replaced the refresh-event list with a persistent accrual journal and a
  separate observed balance-change ledger.
- Kept catch-up intervals, claims, missing observations, and accounting results
  distinct instead of treating movements as profit.

## 0.2.2

- Improved full-window restoration, resize and maximize behavior, and recovery
  from off-screen saved positions.
- Hardened malformed balance-history handling while preserving the last valid
  local data and explicit unavailable states.

## 0.2.1

- Polished shared controls, forms, tables, compact ledgers, writing, keyboard
  behavior, and accessibility across the full window and menu-bar widget.
- Kept financial caveats, exact values, reduced-motion behavior, and focus/error
  recovery attached to their relevant surfaces.

## 0.2.0

- Prepared the initial private community alpha: a read-only native Mac monitor
  for public GODL balances, rewards, current values, earnings coverage, goals,
  local history, and reward notifications.
- Added wallet-profile isolation, explicit unknown-data handling, reviewed-anchor
  accounting, privacy guards, contributor guidance, and local packaging.
