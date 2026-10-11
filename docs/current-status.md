# Current status

Reconciled on **11 October 2026**. Start here for continuation; the roadmap
tracks remaining work and the dated review documents retain historical evidence.

Developer ID signing and notarization are on the owner's hold pending Apple
Developer membership. Local development and ad-hoc packages continue.

Current-balance/SOL validation, settled-history detection and funded accounting
are delivered. The approved pending-round/SOL extension now advances verified
cash cost while showing pending stake and gross unclaimed SOL separately. It
retains the last settled net; prospective rewards, route-specific net claim
estimates and whole-wallet profit remain outside scope. Historical recovery now
restores supported partial-day net from saved observations and committed
transaction/price evidence. Previous/next/latest controls now browse older
verified-net weeks in Overview, its earnings sheet and widget details; unproved
gaps stay unknown. Current holdings USD is now checked against exact token amounts
and matching quotes before publication. Supported GODL claims now carry covered
daily net forward using exact receipts and claimable-balance changes; the split
and cumulative profit remain unknown when their basis cannot be proved.

## Working baseline

- The project is a **private, read-only macOS alpha**. No public release,
  transaction controls, wallet connection, signing, claims or mining execution.
- The installed app and retained local universal installers are **0.2.27,
  build 29**, built from app-source commit
  `ecac245a932e795f42e06b78aae814adb8d16e78`. Subsequent documentation-only
  commits do not change that installed binary's provenance.
- Warm Ledger is the native design authority. The menu-bar recorded-rewards
  card has one heading, a prominent estimate, compact asset amounts and a
  visible before-fees-and-costs qualifier. Clicking opens recorded daily history;
  verified net and covered accounting amounts remain separately expandable.
- Local upgrades through 0.2.27 preserved saved profiles, settings,
  accounting evidence, observations and reward read states. Finalized monitoring
  resumed after replacement on the development Apple silicon Mac running macOS 27.
- Launch at login is enabled on that Mac. Actual registration, in-app off/on,
  quit/reopen and persistence across replacement were checked. Sign-out/sign-in,
  approval/denial and clean-Mac lifecycle checks remain untested.
- The implemented feature set includes goals, Activity, recorded reward alerts,
  reviewed accounting import, optional private RPC validation, support diagnostics,
  duplicate-copy protection, wake recovery, CSV export, and private goals/activity
  backup and restore. The roadmap is not a list of missing versions of these features.

## Evidence and limits

The 11 October full preflight passes **610 tests: 174 Swift, 379 engine and 57 Python**.
Native and universal release compilation use warnings as errors. Source, index,
reachable history and generic ZIP privacy checks pass. The ZIP and read-only
mounted DMG contain 359 matching app files; the installed app's ad-hoc signature
and both installer checksums validate.

| Artifact | SHA-256 |
| --- | --- |
| 0.2.27 universal ZIP | `e8eabace0b8d0fd96918ae227b0fdc981bb0865e91269b16e717e3ac3f45a06c` |
| 0.2.27 universal DMG | `72140c1a7024543320784b1cdff3aae94f0639b7dfaf12eff434633c1563614e` |

Both app and bundled Node contain arm64 and x86_64 slices. This proves packaging
and cross-compilation, not native Intel operation. The app targets macOS 14+;
the documented minimum still needs physical validation. Signing is local ad-hoc,
not Developer ID or Apple notarization.

Hosted GitHub checks were rechecked on 11 October: the latest run remains the
30 September run blocked before test execution by account billing/spending limits.
The 7 and 11 October changes are committed locally; no source push or hosted run
was performed in this slice. The private repository's Intel job is deliberately
skipped. Neither condition is passing CI evidence. There are no open PRs or issues,
no extra project branches/worktrees, and no release upload. `main` is the integration
branch and has no branch protection; verify its remote SHA when continuing.

The temporary earnings preview crash on 30 September was caused by invalid
synthetic quote lifetime and forced loading in the preview harness. Its fixture
and error handling were corrected and the preview rechecked, then removed.
It did not involve the installed app or personal history.

## Claim-spanning historical accounting

The 0.2.27 update admits supported standalone GODL claims with existing accounts
into version-3 funded history. Exact owner receipts plus closing minus opening
claimable GODL cancel old carry-in; network fees enter covered cost once. Treasury
debits must reconcile with stored counter changes. Claim-spanning days show a
combined GODL change and covered net without inventing the unrefined/refined split.
Cumulative unrefined profit remains unavailable after a claim. Missing evidence,
changed endpoint refining regimes, pending boundaries and unsupported routes
retain unknown values. Earlier ledger bytes, hashes and reviewed anchors are preserved.

The 610-test preflight and independent integration review passed. A native
production-controller harness loaded an older claim-spanning week through the
bundled helper and kept live state separate. Synthetic window and compact-widget
checks showed exact combined amounts and unknown denomination splits. The final
packaged helper reproduced the expected receipt-adjusted GODL, costs and net,
leaving all eight synthetic input files unchanged. See the
[contract and proof](plans/claim-spanning-history.md).

All 37,063 prior observations and 311 reward entries survived the local upgrade.
Ten state files were unchanged during replacement and five static settings stayed
unchanged after launch. Fresh finalized observations and current accounting resumed;
the installed window and widget retained the seven covered days. The initial
observation refresh timed out, then recovered on retry without losing saved history.
The current profile still follows legacy closed accounting; v3 claim behavior is
verified synthetically, not by making a wallet transaction. The previous 0.2.26
app and consistent private database/state backup are retained. No history restore
or migration was performed, and Developer ID signing remains on hold.

## Exact holdings and saved claim evidence

The 0.2.26 update rejects supplied current holdings USD that disagree with the
observed amount and exact-mint quote after the engine's six-decimal half-up
rounding. It preserves large legacy amounts, missing values and freshness rules.
The production-controller harness proves rejection retains the accepted monitor,
goals and rewards, followed by recovery on a valid refresh. An independent review
and 17 new native tests passed. See [holdings validation](plans/holdings-validation.md).

The bundled [offline claim inspector](claim-evidence.md) separately validates a
saved RPC record and extracts exact owner/referral GODL receipts and the owner's
network fee for supported standalone claims with existing accounts. Its 80
projector/CLI checks and independent source/integration review passed, including
the pinned four-account token-transfer ABI. Packaged Node reproduced the synthetic
v0 referral receipt without changing its input. Unsupported routes and missing
evidence remain unavailable. Principal attribution, refining deductions and
independent chain authenticity/finality remain unknown. The dashboard does not
import the inspector report. The later 0.2.27 collector reuses its narrow projector
within complete accounting intervals before admitting supported claims to history.

The universal build, ZIP/DMG equality, ad-hoc signatures, checksums and privacy
checks passed. The installed window and widget show current validated holdings
and retained history; all three live USD products also matched an independent
exact-decimal check. All 36,907 pre-upgrade observations and 310 reward entries
survived, ten JSON files were unchanged during replacement, and five static
settings remained unchanged after launch. Fresh finalized observations resumed.
The previous 0.2.25 app and consistent private database/state backup are retained;
rollback replaces only the app. Developer ID signing remains on hold.

## Older-week verified-net history

Installed 0.2.25 adds previous/next/latest seven-day navigation inside **Verified
net & covered amounts** in Overview, its earnings sheet and widget daily details.
An offline helper reads the existing profile and reuses the original recovery
proof. Its validated response stays separate from the live monitor; current
holdings, cumulative results, observations and reward notifications keep their
normal live path. Actual current time still controls quote freshness.

Navigation stops at the earliest verified closing day. Missing observations,
incomplete reward inputs or missing prices remain unknown; there is no pre-anchor
reconstruction or full-day assumption. A failed request shows retry without
putting current numbers under an old date label. No storage migration or persisted
historical cache was introduced.

The 416-test preflight and independent integration/accounting review passed.
Synthetic native window, sheet and compact-widget journeys verified old weeks,
earliest limits, unknown gaps, failure/retry and return to latest. Installed
Overview/widget navigation recovered the older supported week and retained
unavailable net in the earliest week. Universal package validation passed.
All 36,765 pre-upgrade observations and 310 reward entries survived, ten JSON
state files were unchanged during replacement and all five static settings
remained unchanged after launch. Fresh finalized observations resumed. The
previous 0.2.24 app and consistent private database/state backup are retained;
rollback replaces only the app, without restoring old data over newer history.
See the [navigation contract and proof](plans/older-net-history.md).

## Covered historical accounting

The 0.2.24 update recovers actual saved settled boundaries inside committed
reconciliation intervals. Full interval and prefix/suffix replay must reproduce
original exact costs and transaction evidence under the original accounting method.
This restores partial-day net in the seven-day table without changing cumulative
totals, current holdings, starting anchors, journals or ledger hashes. Balances
publish before optional recovery; missing or corrupt evidence preserves the baseline.

The 396-test preflight, independent monetary review and focused blocker recheck
passed. The production native loader/controller, synthetic window/widget and
installed window/widget show recovered amounts with explicit partial-day
and current-price qualifiers. The private live report now has supported partial
coverage for all seven displayed days, while absent evidence remains unknown.
Universal package slices, signatures, ZIP/DMG equality and privacy checks passed.

All previous observation rows and reward entries survived the local replacement,
all static profile/accounting settings remained unchanged, and fresh finalized
monitoring resumed. The previous 0.2.23 app and consistent private database/state
backup remain available. Older-week navigation followed in 0.2.25; pre-anchor
reconstruction and claim-spanning principal remain separate scope. See the
[recovery contract and proof](plans/historical-accounting.md).

## Pending-round and stored-SOL accounting

The 0.2.23 update records pending stake as an unknown outcome and unclaimed SOL
as an exact gross amount before claim deductions. Cash costs advance using
verified transactions and event prices. Stored accrual is not rent or a cash
receipt; actual wallet/automation receipts offset cost once. Complete net stays
at the last settled boundary while either amount remains outstanding.

Version-2 sidecars link to existing version-1 ledgers without rewriting the
reviewed anchor, closed history or prior hashes. Missing/corrupt evidence keeps
the dated closed result and independent holdings. Restart, provider failure,
newer sidecar preservation and actual publication fallback have synthetic proof.
The full preflight passes **370 tests: 142 Swift, 171 engine and 57 Python**.
Independent monetary review found no P0/P1 issues; its P3 combined protocol-fixture
note is deferred in the roadmap. The production native loader/controller accepts
the new position while retaining the previous settled net, and synthetic window
and widget checks show exact amounts with explicit unknown/gross qualifiers.
The universal ZIP/DMG, bundled executable slices, ad-hoc signatures and privacy
checks passed. The local upgrade preserved every prior observation and reward
entry plus all static settings; fresh monitoring and current accounting resumed.
The installed Overview retains recorded history and the widget retains today’s
covered net. The current live profile is settled and follows the closed path;
open-state behavior was verified synthetically. The previous 0.2.22 app and a
consistent private database/state backup remain available.
See the [contract and rollback](plans/pending-sol-accounting.md).

## Settled mining accounting correction

The 0.2.21 update recognizes retained deployment grids after exact checkpoint
settlement and excludes standalone gold claims from unrefined mining costs.
The saved transaction interval passed private offline and full provider replay;
after installation, actual accounting advanced from its old boundary to today.
All prior observations/reward entries and static settings survived. Full-window
and widget state were checked. The previous 0.2.20 app and consistent private
backup remain available. See the [change brief](plans/active-mining-accounting.md).

## Funded terminal-round accounting

The earlier 0.2.22 update excludes refundable automation deposits and refunds from mining
cost, counts reserve consumption without wallet movement, and values those costs
at event SOL prices. Exact fees and actual SOL returns are counted once. The
separate hash-linked ledger freezes the reviewed closed prefix and preserves it
on malformed state or missing coverage. Pending rounds and stored SOL retain the
last dated verified result.

An independent review found a P1 interrupted-publication false fork. The correction
marks persisted heads before replacement, ignores unpublished run evidence and
still rejects conflicting committed children. Its focused recheck passed, including
synthetic interruption/restart, consumption pricing and closed-history fallback.
Native production-loader/controller checks accepted generated funded output;
full-window and widget inspection confirmed exact partial-day and cumulative
figures. The interruption proof is a state replay, not an actual process-kill test.

The installed app resumed fresh observations and current accounting. The Overview
retains saved gross history, and the widget now has today's verified partial net
interval. All prior observations, reward entries and static settings survived;
the previous 0.2.21 app and a consistent private database/state backup are retained.
The live profile currently follows the closed path; funded behavior was verified
with synthetic transaction fixtures, without funding or operating a miner.


## Current balance and SOL validation

The 0.2.20 native file boundary rejects inconsistent GODL and SOL integer/display
pairs across current balances, deployment and automation fields. Unavailable
values stay unknown and larger legacy integers keep their exact representation.
The [validation evidence](balance-validation.md) records malformed-input tests,
independent review and the production-controller recovery check. A read-only check
also accepted the existing private observation.

The installed window and compact widget showed saved history and matching current
holdings after replacement. All prior observation rows and reward entries survived;
fresh observations resumed. All ten saved state files were unchanged during bundle
replacement, and all five static configuration/accounting files stayed unchanged
after launch. The previous app, consistent SQLite backup and private receipts are
retained for rollback. No history migration or accounting-evidence rewrite occurred.

## Recorded history and number correction

The 0.2.19 Overview and compact daily detail now chart saved gross rewards,
independently of settled accounting checkpoints. Earlier seven-day windows, asset
metrics and exact selected-day amounts are available. Missing observations remain
unknown, expired prices do not erase token history, and recorded increases are
explicitly before fees and costs.

Midnight coalescing no longer causes later same-day rewards to be excluded with
an overnight interval. Existing merged intervals remain preserved and unsplit;
no historical allocation was guessed. The last verified mining result visibly
states both period endpoints and current-price valuation. Today's accounting
state is not applied to older uncovered days.

[History correction evidence](history-correction.md) records the regression tests,
independent review, scope and rollback. Synthetic full-window and compact-widget
journeys passed, including older weeks, exact amounts, metric selection and
returning to Overview. After replacement, the installed Overview and widget both
showed existing saved history and current holdings consistently; fresh finalized
observations resumed. A read-only arithmetic check independently recomputed the
three holdings and their USD valuations from the same stored finalized snapshot.
This is internal-consistency evidence, not certification of the starting accounting
anchor, transaction completeness, whole-wallet profit or complete daily income.

Ten state JSON files were unchanged during bundle replacement. Static profile,
RPC, goals and accounting inputs remained unchanged after launch; all prior
observation rows and earlier reward entries were preserved. The previous app and
a consistent database/state backup are retained privately for rollback. No schema
migration or accounting-evidence rewrite occurred.

Settings saves now preserve unreadable/newer-version files with specific recovery
wording. Login-item errors request an accessibility announcement (actual VoiceOver
delivery remains untested). Wrong-genesis accounting failures use the specific
Mainnet recovery message. The consolidated remaining product work is in the roadmap.

## Balance refresh correction

The 0.2.18 update publishes finalized balances while an optional quote request is
still pending, then updates valuations for the same observation. Independent RPC
requests run concurrently. History preparation runs outside the main actor and
uses a faster date parser; explicit/accounting refresh requests coalesce instead
of being dropped while a helper is busy. Common-mode timers check every 15 seconds.
Invalid accounting history no longer suppresses independent current holdings.

[Balance refresh evidence](balance-refresh.md) records the invariants, local
benchmark, regression checks and native synthetic integration proof. Both window
and compact widget were inspected. The prior app and private state/database backup
are retained outside the repository for rollback. Chain finalization and settled
accounting requirements remain unchanged.

## Cleanup and continuity

The 30 September cleanup removed obsolete preview preferences, generated preview
packages, compiler/dependency/runtime caches and synthetic test leftovers.
That cleanup retained the then-current 0.2.17 app and installers. The 7 October
upgrade added 0.2.18; the 11 October upgrades add 0.2.19 through 0.2.27 and retain the
previous installed version for rollback. Recovery snapshots,
original design handoffs, unique historical source and review evidence are
preserved privately rather than treated as caches.
Old screenshots and review totals are explicitly dated.

The live profile directory and both runtime database files have owner-only
permissions. The installed app retains its enabled login item and notification
entry. Removed preview identities were not registered for a per-app permission
reset; no system-wide privacy or notification settings were reset. Private
cleanup receipts record the exact scope and preserved recovery material.

## Continue from here

1. Read [Roadmap](roadmap.md) and [Releasing](releasing.md) for the remaining
   platform, signing, artwork, accounting-onboarding and repository gates.
2. Keep monetary boundaries from [Accounting](accounting.md): recorded rewards
   are gross observed increases; verified net needs covered costs; cumulative
   gain/loss is unrefined-only, not whole-wallet profit.
3. Treat the [image provenance](images/README.md) and earlier review reports as
   dated evidence, not screenshots or test totals for the current release.
4. Recreate removed local dependencies/build caches using
   [Development](development.md). Preserve local runtime data and the active
   instance lock; neither is a disposable cache.
5. The earlier autominer research is a separate historical workstream. It does
   not make this monitor a trading/mining controller or establish profitable
   execution. No public distribution or visibility change is authorized.

Nous carries private machine-specific continuity and recovery locations. They,
along with personal wallet/RPC data, stay outside this repository.
