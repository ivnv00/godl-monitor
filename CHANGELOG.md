# Changelog

All notable user-facing changes to GODL Monitor are recorded here. Every version
below is a private local alpha candidate; none represents a public release.

## 0.2.39 — 17 October 2026

- Reduce daily-mining cache validation work by reading each transaction's local
  calendar day once with a shared formatter. Exact midnight and raw-evidence
  checks remain unchanged; no history, chart points or accounting evidence is
  removed.
- Add bounded calendar-work and daylight-saving/fractional-offset regression
  coverage, including rejection and preservation of a changed wrong-day cache.

## 0.2.38 — 17 October 2026

- Reduce helper memory by streaming recent full snapshots into the existing
  chart projection, preserving all 10,000 points, exact values and validation.
  Retain the established cold-history selection when needed.
- Reduce runtime JSON serialization and parsing work with compact transport;
  accounting calculations, saved evidence and refresh cadence are unchanged.

## 0.2.36 — 16 October 2026

- Preserve original observation history with lossless compressed older snapshots,
  while keeping the latest 10,000 per wallet/network directly readable and fast.
  Bound maintenance after live publication; retain exact hashes and accounting
  boundaries. Provide offline compression and complete expansion for downgrades.
- Compress original raw accounting responses and finalized cache files without
  changing their bytes. Keep reconciliation records and settings plain. Reject
  conflicting or corrupt saved files; avoid large account reads when the program
  deployment already prevents reconciliation.

## 0.2.35 — 16 October 2026

- Restore a concise widget earnings card: three native amounts and one fee note.
  Exact coverage, current-price valuation and observed catch-up remain in daily
  details and tooltips. Older mining coverage shows its cutoff; unknown daily
  rewards stay unavailable.

## 0.2.34 — 16 October 2026

- Show full-day refined GODL and gold yield from a verified private midnight
  opening, with exact current-slot validation and independent asset coverage.
  Gold includes earnings already claimed; unsupported refined claim spans stay
  unavailable. Keep observed journal intervals and historical net separate.
- Capture future midnight openings only when genuine chain-time brackets,
  unchanged shared factors and exact projected amounts prove the boundary.
  Keep normal polling offline, cap compact files and preserve unreadable evidence.
  Offline gaps containing distributions still require separate reconstruction.

## 0.2.33 — 16 October 2026

- Recover today's unrefined mining credits from complete finalized checkpoint
  history, including offline hours. Verify integer-exact log amounts, miner/round
  attribution, successful invocation traces and the supported program deployment.
- Show the credit boundary and unrefined-only valuation. Keep refined/gold
  observations explicitly partial and cross-day catch-up visible after new gains;
  never add recovered principal to observed increases or guess missing daily yield.
- Resume bounded recovery from a size-limited current-day cache after publishing
  live balances. Reuse finalized transactions and throttle completed refreshes.

## 0.2.32 — 16 October 2026

- Show recovered cross-day rewards with their actual observation range when
  today's saved intervals are absent. Keep daily charts and totals separate;
  newly observed same-day gains return the summary to Recorded today.
- Skip historical recovery reads outside the requested calendar window and
  suspend automatic accounting retries for the known unsupported program/source
  transition. Explicit retries and other recovery states remain available.

## 0.2.31 — 16 October 2026

- Reject gold quotes that disagree with an independent, timestamped Tether Gold
  reference, including old cached quotes. Keep native amounts and independently
  valid GODL estimates available when gold pricing cannot be verified.
- Restore finalized observations after the protocol's Config expansion, retaining
  both exact supported layouts. Preserve dated accounting and older-week history
  separately from current holdings; do not advance net across a program upgrade.

## 0.2.30 — 11 October 2026

- Publish validated balances and available holdings estimates before loading
  accounting history, then enrich the same finalized observation.
- Keep previously verified, dated chart history and older-week selection while
  accounting loads; new or unproved results remain unknown. Preserve all local
  observations, settings, reward read states and accounting evidence.

## 0.2.29 — 11 October 2026

- Reject supplied daily and cumulative net USD inconsistent with reward value
  minus spend, allowing exact independent six-decimal rounding. Preserve signed
  values, unknown results, prior accepted views and all saved history.

- Isolate packaging from inherited Node startup/module-path hooks; stop local
  preflight when installed dependency metadata differs from the lockfile.
- Record validated Swift, Xcode and macOS SDK identifiers in new package
  provenance, using those selected tools for compilation and preserving older artifacts.
- Bridge notification permission, scheduling and login-item removal through
  callbacks that transfer only values or completion errors, addressing concurrency
  errors reported by the macOS 15.5 SDK. Local verification uses Xcode 26.2; a full
  older-SDK recheck remains pending.
- Skip every GitHub-hosted job while the repository is private, using local
  preflight to avoid paid CI. Public-release approval remains a separate gate.

## 0.2.28 — 11 October 2026

- Show exact claimed principal, claimed refined rewards, refining/referral fees
  and owner receipts when saved committed evidence isolates every covered claim.
- Keep ambiguous breakdowns unavailable and preserve existing daily boundaries,
  net calculations, cumulative-profit limits and saved ledger bytes.

## 0.2.27 — 11 October 2026

- Continue covered daily net across supported standalone GODL claims using exact
  owner receipts and claimable-balance changes, counting network fees once.
- Preserve older ledgers; keep daily denomination splits and cumulative profit
  unavailable when the historical basis cannot be established.

## 0.2.26 — 11 October 2026

- Validate current holdings USD against exact token amounts and matching quotes.
- Add an offline inspector for saved supported GODL claim receipts and network
  fees. It does not execute claims or import its report into the dashboard.

## 0.2.25 — 11 October 2026

- Browse older verified-net weeks in Overview, the earnings sheet and widget
  details with previous, next and latest controls.
- Keep historical responses separate from current balances and preserve unknown
  gaps, real quote freshness and the earliest verified-history boundary.

## 0.2.24 — 11 October 2026

- Recover covered partial-day net from saved observations inside committed
  accounting intervals after replay proves their original transaction costs.
- Publish current balances before optional recovery; preserve anchors, hashes,
  cumulative totals and existing history when evidence is absent or invalid.

## 0.2.23 — 11 October 2026

- Advance verified cash costs during pending rounds and while SOL is unclaimed.
- Show pending stake and gross stored SOL separately, without guessing a reward
  or treating a pending stake as a loss. Retain the last settled net boundary.

## 0.2.22 — 11 October 2026

- Reconcile funded automation reserves without counting refundable capital as
  mining cost; count consumed reserves, actual SOL returns and event-price costs.
- Link the funded ledger to the reviewed closed history without rewriting it.
  Recover safely from interrupted publication and preserve unsupported sidecars.

## 0.2.21 — 11 October 2026

- Recognize completed rounds whose deployment grid remains on the miner. Exact
  matching round/checkpoint markers unblock closed-cost reconciliation while
  preserving pending-funds, ownership, claim and evidence checks.
- Recognize standalone gold claims without charging their costs to unrefined
  mining; mixed transactions and owned SOL movements remain guarded.
- Preserve old receipts and history; no new accounting basis or migration.

## 0.2.20 — local alpha

- Reject inconsistent current unrefined/stored-refined GODL and SOL amount
  representations before they reach the dashboard, goals or strategy details.
- Check stored claimable SOL, last deployed SOL and each automation's balance,
  per-square amount and executor fee against exact lamport precision.
- Preserve observed zero, unavailable values, large legacy integer amounts and
  existing history. Invalid publications retain the last accepted observation;
  a subsequent valid publication recovers normally.

## 0.2.19 — local alpha

- Show saved daily reward history in Overview and both daily-detail routes,
  with previous/next-week navigation, per-asset quantities and current-price USD.
  Recorded gross rewards remain separate from verified net and missing days stay unknown.
- Prevent a reward interval crossing midnight from absorbing subsequent same-day
  increases. Existing merged intervals are preserved without inventing a split.
- Show the ending date of the last verified mining result. Current accounting
  progress applies to today, while older uncovered dates remain explicitly unavailable.
- Preserve unreadable/newer wallet settings at the save boundary and show accurate
  recovery guidance; request accessibility focus/announcement for login-item failures.
- Identify a wrong-network accounting endpoint without changing closed-accounting rules.

## Earlier private alpha work — 0.2.8–0.2.18

- 0.2.18 corrected balance publication latency, asynchronous history preparation,
  refresh coalescing and 15-second observation scheduling. See
  [verified local evidence](docs/balance-refresh.md).


- Simplified the menu-bar recorded-rewards card around one prominent estimate,
  a compact asset breakdown and a single before-fees-and-costs note. Settlement
  status, exact quantities and coverage explanations remain in daily details.

- Added private goals/activity backup and review-before-restore. Exact recorded
  rewards, goal styles/order and read states move into a new wallet profile;
  existing profiles are never merged or replaced. Provider credentials and
  accounting/observation files are excluded, and reward detection starts from
  a fresh baseline after restore.

- Added Activity CSV export for all recorded intervals matching the asset filter,
  with exact token quantities, UTC bounds, blank missing amounts and explicit
  gross-accrual scope. Wallet addresses, RPC details and notification read states
  are excluded; exporting does not change saved history.

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
  Actual registration, off/on, quit/reopen and installed-app replacement were
  verified locally on 30 September. Real login/logout, approval/denial and
  clean-Mac lifecycle validation remain release checks.
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
