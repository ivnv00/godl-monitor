# Roadmap

GODL Monitor remains a private alpha. The current source can build a local
0.2.26 universal app, ZIP, and DMG with Apple silicon and Intel executable slices,
checksums, ad-hoc signatures, and package privacy checks. These local artifacts
are preparation evidence, not a public release or proof of native Intel use.

There are no promised dates. Community launch remains gated by the following
small, reviewable outcomes. [Current status](current-status.md) separates the
installed baseline and latest local evidence from these remaining gates.

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
  CI job is prepared for Swift tests; it has not executed and does not replace
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

## Deferred product and review backlog

This is the consolidated index of existing deferred work. P2 items retain their
recorded severity; “not ranked” means the source did not assign a severity.
These entries are not delivery blockers for the current slice or promises of
completed fixes. Promoting an item requires an explicit owner instruction or
proof that it is necessary for an in-scope P0/P1 correction.

| Item | Recorded severity | Current limitation and next boundary | Evidence |
| --- | --- | --- | --- |
| Activity across decoder-source changes | P2 | Backups retain older source identities, while Activity filters to the active decoder identity. Current candidates share that identity; future changes need an explicit compatibility decision. The closed transfer slice did not include a migration. | [Transfer contract](plans/profile-transfer.md), [transfer guide](profile-transfer.md) |
| Failed system-notification delivery | P2 | A failed system notification is not retried; the reward remains in the persistent inbox. Retry behavior needs separate acceptance criteria and tests. | [Stability review](stability-review.md#remaining-limits) |
| Other legacy monetary-field validation | P2 | Current GODL/SOL consistency is covered in 0.2.20 and current holdings/quote relationships in 0.2.26. Legacy goal-target validation remains separate scope; signed accounting and missing data keep their existing rules. | [Stability review](stability-review.md#remaining-limits), [holdings validation](plans/holdings-validation.md) |
| Combined executor claim-and-deploy fixture | P3 | Separate tests cover custody, keeper costs and claims. Add a protocol-realistic automationV2 executor claim followed by deployment in one interval; current publication fixture uses legacy automation and an owner-paid fee. No implementation defect found. | [Pending/SOL review note](plans/pending-sol-accounting.md#milestone-evidence) |
| Remaining historical accounting | Beyond covered saved observations | Seven-day pages browse older supported intervals. Offline claim evidence now proves supported receipts separately; a versioned claim/principal bridge, account-creation claim routes and pre-monitor/pre-anchor reconstruction remain future work. Missing evidence stays unknown. | [Historical recovery contract](plans/historical-accounting.md), [claim evidence](plans/claim-evidence.md), [accounting coverage](accounting.md) |
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
  Hosted jobs are blocked by account billing, and `main` has no branch
  protection as of 30 September. Queued or billing-blocked jobs are not passing evidence.
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
