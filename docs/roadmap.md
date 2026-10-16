# Roadmap

GODL Monitor remains a private alpha. The current source can build a local
0.2.30 universal app, ZIP, and DMG with Apple silicon and Intel executable slices,
checksums, ad-hoc signatures, and package privacy checks. These local artifacts
are preparation evidence, not a public release or proof of native Intel use.

There are no promised dates. Community launch remains gated by the following
small, reviewable outcomes. [Current status](current-status.md) separates the
installed baseline and latest local evidence from these remaining gates.

This file is the repository's open-work tracker. Completed versions belong in
the [changelog](../CHANGELOG.md); dated plans/reviews retain their original scope
and proof. GitHub had no open PRs or issues at the 11 October reconciliation.
Deferred work below remains open; documentation reconciliation does not promote
it into implementation or lift the signing hold.

## Distribution and platform proof

- **Owner hold:** Developer ID signing and notarization are paused pending Apple
  Developer membership. After the owner lifts the hold, exercise the prepared
  [signing path](notarization.md) only with a reviewed public signing identity and
  explicit authorization for the exact candidate. Membership does not establish
  successful signing, Apple acceptance or platform compatibility. Independent code
  review is complete; the preview, synthetic failure checks and local hardened-runtime rehearsal are
  preparation evidence. Real app/DMG tickets and Gatekeeper acceptance still
  need verification.
- Test the core journeys on Intel hardware rather than relying on
  cross-compilation and static slice inspection. A public-only `native-intel`
  CI job is prepared for Swift tests; all hosted jobs now skip while private.
  The Intel job has not executed and does not replace
  packaged-app or interactive Intel validation.
- Test installation and core journeys without developer tools on
  clean Apple silicon and Intel Macs.
  The [isolated first-run review](first-run-review.md) covers local setup,
  provider validation, wallet isolation and unsupported-settings preservation;
  it does not replace these clean-machine checks.
- Test macOS 14 for the documented minimum OS, plus a current macOS
  run, including first launch, widget, notifications, wallet switching, state
  preservation, unavailable states, and app replacement.
  Include duplicate-copy startup protection and reopening after forced termination;
  local process tests do not replace supported-version/hardware coverage.
  Wake-triggered recovery has local lifecycle tests and a synthetic native
  controller check; physical sleep/wake and network reconnection remain required.
- Exercise launch-at-login approval/denial, sign-out/sign-in and the full lifecycle
  on clean Macs. Actual registration, in-app off/on, quit/reopen and persistence
  across 0.2.17 replacement passed on the development Mac on 30 September.
  Fake-service tests and this local check do not establish clean-Mac sign-in behavior.

## Portable accounting confidence

- Portable synthetic journeys now cover accounting reconcile/restart/failure,
  checkpoint refresh/projection, earnings chain loading and extension validation.
  They also reject repeated finalized slots without creating duplicate receipts.
  See [coverage and limits](../engine/test-fixtures/README.md).
- Settings now supports local review and import of an already-reviewed accounting
  starting point without replacing history. Expert anchor preparation remains
  separate. Validate that preparation and the full onboarding journey with a
  community wallet before claiming broadly accessible net-accounting setup.
- Re-run native, engine, runtime, packaging, and source/archive privacy gates on
  the exact candidate revision.

## Recent development

The 0.2.19 slice restores browsable recorded-reward history independently of
settled accounting, prevents midnight grouping from hiding subsequent rewards,
and visibly dates the last verified mining result. It also corrects settings
recovery wording, announces login-item errors to accessibility clients, and gives
wrong-network accounting failures specific recovery guidance.
See [history and number correction](history-correction.md) for scope and proof.
The 0.2.20 slice validates current GODL and SOL integer/display consistency while
preserving exact legacy amounts and saved history. See [balance validation](balance-validation.md).

The 0.2.21 slice recognizes checkpointed retained deployment grids and excludes
standalone gold claims from unrefined mining accounting. The 0.2.22 slice advances
funded automation costs while excluding refundable capital and preserving the
reviewed closed prefix. See the [active-mining contract](plans/active-mining-accounting.md).

The 0.2.23 slice keeps cash costs current during pending rounds and unclaimed SOL,
shows both outstanding amounts explicitly, and retains the last dated settled net.
It credits actual SOL receipts once and preserves the reviewed history. See the
[pending/SOL contract](plans/pending-sol-accounting.md).

The 0.2.24 slice recovers partial-day net in the existing seven-day table from
saved settled observations inside committed reconciliation intervals. Complete
transaction/price replay preserves the original cost method, cumulative totals,
reviewed anchors and history. Missing evidence stays unknown. See the
[historical recovery contract](plans/historical-accounting.md).

The 0.2.25 slice adds older-week net navigation to the window and compact details
using a separate offline, read-only projection. Range and response validation
preserve live dashboard state and unknown values. See the
[older-week navigation contract](plans/older-net-history.md).

The 0.2.26 source validates supplied current holdings USD against exact observed
balances and matching quotes before accepting the dashboard publication. A
separate offline inspector proves supported saved GODL owner/referral receipts
and network fees while leaving principal attribution unknown. It does not change
historical net. See [holdings validation](plans/holdings-validation.md) and
[saved claim evidence](claim-evidence.md).

The 0.2.27 slice uses verified claim receipts and claimable-holdings changes to
continue covered daily net across supported GODL claims. It preserves old ledger
versions, keeps the unrefined/refined split and cumulative profit unknown across
claims, and includes their observed network fees once. See the
[claim-spanning history contract](plans/claim-spanning-history.md).

The 0.2.28 slice derives claimed principal and refining fees when saved miner
observations isolate each claim. The shared claim breakdown preserves existing
net calculations, ledger hashes and unknown historical basis. Missing or ambiguous
proof stays unavailable. See the [attribution contract](plans/claimed-principal.md).

The owner-approved build-reliability slice removes inherited Node startup hooks
from packaging, checks installed dependency metadata before tests, and records
validated native toolchain identifiers. Compilation uses the recorded Swift/SDK
selection. That milestone left the installed app and prior artifacts unchanged; see the
[build contract and verification](plans/build-reliability.md).

The 0.2.29 net-validation slice checks daily and cumulative reward-minus-spend
relationships using exact signed microdollars. Independent rounding, negative
amounts, missing net and historical boundaries retain their existing meaning.
See the [contract and proof](plans/net-arithmetic-validation.md).

The 0.2.30 early-publication slice shows validated balances before accounting-chain
reads, retains dated historical selection during interim updates, and preserves
existing final results. Held-loader, native timeout/recovery, local upgrade and
history-preservation checks pass. See the [contract and proof](plans/early-balance-publication.md).

## Deferred product and review backlog

This is the consolidated index of existing deferred work. P2 items retain their
recorded severity; “not ranked” means the source did not assign a severity.
These entries are not delivery blockers for the current slice or promises of
completed fixes. Promoting an item requires an explicit owner instruction or
proof that it is necessary for an in-scope P0/P1 correction.

| Item | Recorded severity | Current limitation and next boundary | Evidence |
| --- | --- | --- | --- |
| Recovered-yield widget heading fallback | P3 | With mining coverage unavailable, the outer widget heading still says observed/partial even when inner refined/gold rewards have verified full-day coverage. Inner asset boundaries remain explicit; a heading-only refinement is deferred. | [Daily yield review](plans/full-day-yield-and-resources.md) |
| Extra dependency shadowing | P2 | Preflight checks lock-listed package metadata but does not scan extraneous nested packages that can change module resolution. A clean `npm ci` is the current remedy; strict installed-tree checking needs its own scoped acceptance criteria. | [Build reliability limits](plans/build-reliability.md), [dependency guard](../scripts/check.py) |
| Disk-image command modernization | P3 | The macOS 27 host warns that `hdiutil` create/attach/detach commands are deprecated. Current image verification succeeds; evaluate the replacement commands with supported build hosts before changing the packaging path. | [Local builder](../scripts/build-local-app.py), [package validation](releasing.md#build-a-local-candidate) |
| Activity across unknown decoder-source changes | P2 | The verified Config-only upgrade shares the existing reward identity in 0.2.31 without rewriting journal entries. Other source changes still need an explicit reward-semantics compatibility decision. | [Recovery contract](plans/gold-readings-recovery.md), [transfer guide](profile-transfer.md) |
| Funded-history fallback status after a program upgrade | P2 | If optional funded evidence fails to load, the closed fallback can reuse its saved status label. Earnings retain their original dates and upgrade reason; current holdings remain independent. Recompute fallback status against the live revision in a separate scoped fix. | [Recovery contract](plans/gold-readings-recovery.md), [publication fallback](../engine/observation-publication.mjs) |
| Daily mining total work deadline | P2 | The ten-second recovery budget bounds network work; cache revalidation and final disk writes are outside it. The actual replay cache validated in 133 ms and the observer retains its 35-second watchdog. A strict combined deadline needs its own bounded proof. | [Daily recovery](plans/daily-mining-recovery.md) |
| Queued accounting wake retry | P2 | A helper spanning wake can enqueue one follow-up through the manual path, bypassing the known incompatible automatic-source guard once. Data and explicit recovery remain intact. | [Efficiency evidence](plans/rewards-and-efficiency.md), [controller](../Sources/GODLMonitor/MonitorController.swift) |
| Failed system-notification delivery | P2 | A failed system notification is not retried; the reward remains in the persistent inbox. Retry behavior needs separate acceptance criteria and tests. | [Stability review](stability-review.md#remaining-limits) |
| Other legacy monetary-field validation | P2 | Current GODL/SOL consistency is covered in 0.2.20 and current holdings/quote relationships in 0.2.26. Legacy goal-target validation remains separate scope; signed accounting and missing data keep their existing rules. | [Stability review](stability-review.md#remaining-limits), [holdings validation](plans/holdings-validation.md) |
| Unneeded prices for excluded gold claims | P2 | Collection requests event-price candles for excluded gold-claim wallet movements. Missing optional prices can delay reconciliation even though the calculator excludes those movements from unrefined cost; prior verified results remain available. | [Gold-claim review note](plans/active-mining-accounting.md#gold-claims-within-the-closed-interval) |
| Net-validation length-boundary test coverage | P3 | The exact 60/61-character boundary passed independent actual-guard probes; preserve those cases in the committed suite in a later test-hardening slice. Large cancellation and precision rejection are already covered. | [Net validation proof](plans/net-arithmetic-validation.md#source-verification) |
| Persistent native-controller regression coverage | P3 | The early-publication slice adds persistent GODLCore history-controller regressions and rechecks production startup/publication/timeout callbacks in a private synthetic harness. Bringing those app/helper callback cases into a tracked native test target remains separate coverage work; no observed regression. | [Test targets](../Package.swift), [controller](../Sources/GODLMonitor/MonitorController.swift) |
| Combined executor claim-and-deploy fixture | P3 | Separate tests cover custody, keeper costs and claims. Add a protocol-realistic automationV2 executor claim followed by deployment in one interval; current publication fixture uses legacy automation and an owner-paid fee. No implementation defect found. | [Pending/SOL review note](plans/pending-sol-accounting.md#milestone-evidence) |
| Temporary-path app alias | P2 | A synthetic app launched through `/tmp` could not resolve its bundled helper; the same app worked from a normal local path. Normalize both sides of the runtime containment check in a separately scoped fix. Normal installed-app operation is unaffected. | [Claim-spanning verification](plans/claim-spanning-history.md#milestone-evidence) |
| Remaining historical accounting | Beyond covered saved observations | Versioned history crosses supported standalone existing-account GODL claims, with principal/refining breakdown when each claim is isolated. Attribution amid other miner activity or multiple claims in one interval, account-creation/mixed routes, separate historical acquisition basis and pre-monitor/pre-anchor reconstruction remain future work. Missing evidence stays unknown. | [Attribution contract](plans/claimed-principal.md), [claim-spanning contract](plans/claim-spanning-history.md), [accounting coverage](accounting.md) |
| Prospective SOL valuation and broader accounting | Beyond verified cash and observed position | Pending stake and gross stored SOL are separate exact amounts; cash costs advance while complete net retains its last settled boundary. Prospective round/pool rewards, route-specific net claim estimates, automatic expert anchors and whole-wallet profit remain outside this slice. | [Pending/SOL contract](plans/pending-sol-accounting.md), [accounting coverage](accounting.md) |

The [goals/activity transfer slice](plans/profile-transfer.md) is closed: it adds
private backup/restore into a new profile, not merge, replacement, cloud sync,
accounting migration or reconstructed transfer-gap income. Keep its delivered
scope separate from the future decoder compatibility work above.

The historical cached-timezone finding in the Activity review is no longer an
open item: the current interval formatter receives the earnings timezone. Daily
net availability also uses that accounting calendar; the dated review remains a
record of its original finding.

## Rights and repository readiness

- Resolve redistribution permission for the bundled GODL artwork and record the
  approved rights boundary in the public-facing notices.
- Decide how hosted required checks and merge protection will be enforced.
  The private alpha now deliberately uses local preflight to avoid paid hosted
  runners; public-only job conditions enforce that boundary. `main` still has no
  branch protection. See [current status](current-status.md) for dated run results
  and the remaining older-SDK compatibility check before enabling public CI.
  Queued, skipped or billing-blocked jobs are not passing evidence.
  [Contribution checks](contribution-checks.md) records the no-paid-plan public
  path and the settings to verify after an approved visibility change.
- Review public issue, contribution, security, and release surfaces against the
  exact repository state without adding automatic publication.

## Launch decision

- Present the exact source revision, signed and notarized artifacts, checksums,
  privacy result, rights decision, and platform/accounting evidence for owner
  review.
- Obtain explicit final owner approval before changing visibility, publishing a
  release, uploading artifacts, enabling Pages, or announcing availability.

The detailed candidate commands and validation matrix live in
[Releasing](releasing.md). Accounting limits remain authoritative in
[Accounting and coverage](accounting.md).
