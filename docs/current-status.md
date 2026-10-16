# Current status

Reconciled on **16 October 2026**. Start here for continuation; the roadmap
tracks remaining work and the dated review documents retain historical evidence.

The versioned sections below record each installation milestone. Their test
counts, preserved-row counts and then-open limitations are dated evidence, not
competing current baselines. Use Working baseline and Evidence and limits for
current facts, the changelog for delivered versions, and the roadmap for open work.

Developer ID signing and notarization are on the owner's hold pending Apple
Developer membership. Local development and ad-hoc packages continue.

The 16 October recovery restores current observations after the verified protocol
Config expansion and rejects independently inconsistent gold quotes, including
old cached prices. Daily mining principal now recovers from complete finalized
checkpoint history across offline hours, with its credit-time boundary visible.
Full-day refined/gold yield now projects from privately verified midnight
openings. Claimed gold remains included; unsupported refined claim spans and
unproved future midnight gaps stay unknown. Observed journal intervals and
cross-day catch-up retain their separate dates and partial coverage. Net across
the program upgrade remains unknown.
Resource work avoids irrelevant historical reads and known incompatible automatic
accounting retries. See [daily recovery](plans/daily-mining-recovery.md),
[quote/protocol recovery](plans/gold-readings-recovery.md) and
[efficiency evidence](plans/rewards-and-efficiency.md), plus
[full-day yield and resource validation](plans/full-day-yield-and-resources.md), and
[lossless history storage and final GPU checks](plans/history-storage-and-gpu.md).

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
and cumulative profit remain unknown when their basis cannot be proved. Isolated
claims now also expose exact claimed principal, refined rewards and fees when
committed evidence proves every component; this does not change historical net.
Supplied daily and cumulative net USD now also pass exact reward-minus-spend
relationship checks before either live or historical native publication. Validated
balances now publish before optional accounting-chain loading; the chart retains
its previously verified, dated history during matching interim updates.

## Working baseline

- The project is a **private, read-only macOS alpha**. No public release,
  transaction controls, wallet connection, signing, claims or mining execution.
- The installed app and retained local Apple silicon installer are **0.2.36,
  build 39**, built from app-source commit
  `9fbe8fe793a1fadd6822de7470b092facb240668`. The later evidence documentation
  does not change this installed binary’s source provenance.
- Warm Ledger is the native design authority. The menu-bar mining card shows
  exact recovered principal, the covered hours, unrefined-only current-price
  value, full-day refined/gold yield and separately dated partial observations.
  The compact summary now shows the three amounts with one fee note; detailed
  coverage, unrefined-only valuation and catch-up context remain on demand.
  Its header/footer remain visible while overflowing middle content scrolls.
  Clicking opens daily details;
  verified net and covered accounting amounts remain separately expandable.
- Local upgrades through 0.2.36 preserved saved profiles, settings,
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

The 16 October full preflight passes **812 tests: 206 Swift, 539 engine and 67 Python**.
The installed Apple silicon candidate's release compilation passed with warnings
as errors using Xcode 27.0 (27A266a), Swift 6.4 and macOS SDK 27.0 (26A425).
Source, index, reachable history and generic ZIP privacy checks pass. The ZIP
contains 366 app files; extracted/installed trees match, ad-hoc signatures and
the installer checksum validate. Production engine/native read-back accepted
recovered mining credits and exact daily refined/gold yield together with 10,000
saved observation points. Independent review and the focused widget overflow
recheck found no remaining P0/P1. Both installed window and widget were inspected;
top/bottom scrolling preserves amounts, goal progress and footer access.

| Artifact | SHA-256 |
| --- | --- |
| 0.2.36 build 39 Apple silicon ZIP | `889a6bb4fc31b9009e0c437d6eb118a7a715485efd03b16245b12504106d811a` |
| Retained 0.2.31 universal ZIP | `3b1fdc96307f3f70e4ec61730c860a1b40091743f25f9cab5f637f41ba186251` |
| Retained 0.2.31 universal DMG | `61f66fc6dff67cfe85f04cadf2e817d694dce0ea33fad5a2b5d1d36687fc4190` |

The current app and bundled Node contain arm64; the retained 0.2.31 app contains
both arm64 and x86_64. Universal packaging now uses separate per-architecture
scratch outputs, verified after both builds, because the newer Swift backend can
otherwise reuse one product path. This proves packaging and cross-compilation,
not native Intel operation. The app targets macOS 14+;
the documented minimum still needs physical validation. Signing is local ad-hoc,
not Developer ID or Apple notarization.

The 0.2.36 replacement preserved all 48,510 prior observations, 377 journal
entries and 33,509 accounting-evidence files. Thirteen state files were unchanged
at replacement; five static settings remain unchanged after launch. Finalized
monitoring resumed with the configured goal and clean widget intact. All evidence
files match their original decompressed bytes; both current and private backup
representations were verified. The previous app and consistent original database/
state backup remain private. Downgrading now requires the newer helper to expand
all current compressed history first; never restore an old database over newer
observations. This supersedes app-only rollback at earlier dated milestones.

A six-minute 0.2.32 sample showed no sustained app RAM climb (87–138 MiB app RSS;
about 426 MiB maximum sampled app plus helper). Short helper CPU bursts remain
normal. These older timing samples do not prove a speedup. Recovery uses a
size-limited current-day cache and bounded network
work. Obsolete generated installers and Swift build caches were removed, reducing
their measured allocated storage by about 3.35 GiB. Current/previous working
installers, profile history, accounting evidence and rollback apps remain intact.
This does not certify perfect performance or prune original financial evidence.

The installed 0.2.33 three-minute sample kept views current (maximum observed
update gap 15 seconds), advanced recovered coverage across two refresh cycles and
showed 64 app file descriptors at both endpoints. App RSS ranged 97–143 MiB;
helpers peaked at 345 MiB in brief sampled runs. The derived daily cache peaked
at 1.30 MB against its 16 MiB cap. SQLite gained only the expected new observation
rows, evidence-directory count stayed unchanged, and no timeout/stale symptom was
observed. One-second sampling does not rule out unobserved events or long-term
leaks; GPU and exact network request counts were not measured.

The subsequent 60-minute collection completed 3,600 one-second samples across
profiling and upgrade PID segments. Stable normal processes did not show a
consistent RSS climb; the final 0.2.35 segment is only a short smoke check.
Descriptors ended at 63 versus 67 initially and threads at six versus six.
Sampled helpers remained transient (about 352 MiB maximum RSS), rather than
accumulating. Both the longer normal 0.2.34 heap comparison and final 0.2.35 smoke
reported zero unreachable allocations at their endpoints. The heavily
instrumented process's earlier graphs did not reproduce in controlled tests;
their ownership remains unproved.

Before compression, the derived mining cache stayed at 1.17 MB, yield cache at
1,332 bytes and opening at 880 bytes. The original database gained 198 observations/
844 KB; the old storage format extrapolated to roughly 19 MiB/day at that write
mix. Saved view checkpoints stayed current; one transient provider timeout retained
prior values and recovered. These are dated pre-compression measurements.

Version 0.2.36 preserves every original while compressing older snapshots and raw
accounting responses. The installed database shrank to 66.72 MB; accounting evidence
shrank from 2.215 GB to 1.261 GB. Recent reads retain at least 10,000 hot snapshots
per wallet/network and decode none of the older rows. Maintenance is bounded and
runs after publication; no snapshot or unique evidence was pruned. Unique history
still grows, so compression is not a fixed total storage ceiling. The full private
trial reproduced all 48,459 original rows, twenty local days of closed/funded
accounting selection, and exact expansion back to the older format.

Final-build GPU registry measurements match the exact app PID and stable Metal
client: 2,405,584 raw units in 20 seconds idle and 6,444,458 in 60 seconds containing
seven verified navigation/widget cycles. The counter's units are undocumented;
roughly nanosecond-scale interpretation is supported by a separate Metal timing
probe but is qualified. This is sparse app-client work, not hardware utilization,
FPS or WindowServer cost. No large trace/export was created. The final post-cycle
heap scan found zero unreachable allocations. A separate final 120-second idle
sample kept RSS around 159–164 MiB, descriptors 64 to 63 and CPU near 1.36% of one
core by CPU-time delta. This remains a finite sample, not a universal performance
guarantee. See the
[storage/GPU contract and evidence](plans/history-storage-and-gpu.md), plus the
[earlier hour-long limits](plans/full-day-yield-and-resources.md#completed-hour-long-resource-sample).

The following 11 October sections are historical milestones. Their toolchains,
artifact receipts and synchronization statements describe those earlier events.

The build-reliability rehearsal produced a separate, uninstalled Apple silicon
verification ZIP from `f3cfd0bc0401c45594923f532cc13428811951f1`, with SHA-256
`1f0893731c4b942a9e02f639e00c9993b0d1673b1a840602d2f58fd4893ae5d7`.
Its actual builder blocked inherited Node startup hooks, and its recorded compiler
and SDK identifiers match the selected local toolchain. Release compilation,
packaged smoke checks, extracted signature/slices and privacy checks passed.
At that source-only milestone, the original universal installers, installed
executable and Info.plist retained their before-build hashes; no history or
profile data was touched. See the
[build-reliability proof](plans/build-reliability.md#packaging-verification).

The owner-authorized 11 October source synchronization pushed the 23 existing
implementation/evidence commits and documentation reconciliation to `main`,
preserving their history. The repository is private and `main` is unprotected;
there are no PRs, issues, stashes, extra branches or extra worktrees. Source
synchronization does not authorize a release upload or visibility change.

The earlier billing block is historical. In the executed 11 October
[run at `c85b0b7`](https://github.com/ivnv00/godl-monitor/actions/runs/38135719236),
the engine/portable job passed, while the native job failed compilation under
Xcode 16.4 / macOS 15.5 SDK. The
[run at `82111ad`](https://github.com/ivnv00/godl-monitor/actions/runs/38135918636)
accepted the notification-settings correction, then exposed additional framework
concurrency errors; its engine job passed. Intel remained deliberately skipped.
The source now bridges notification and login-item callbacks without transferring
framework objects between actors. Local tests/release compilation and focused
review passed; a full older-SDK hosted build of the final correction is unverified.
That source-only milestone left the installed app and personal history untouched;
the later 0.2.29 update includes the callback corrections.

The owner then requested avoiding paid CI. All hosted jobs now require public
repository visibility, including manual dispatches, so private pushes use local
preflight and do not allocate hosted runners. Skipped jobs are not passing-test
evidence. The [guard verification run at `eb780ba`](https://github.com/ivnv00/godl-monitor/actions/runs/38136422060)
skipped all three jobs, with zero steps and no runner assigned. Recheck the intended public runner/toolchain before a separately approved
public launch; the current SDK can build for an older deployment target without
requiring an older build SDK. See [contribution checks](contribution-checks.md).

A bounded 11 October engineering review found no new established P0/P1 blocker.
Installed engine dependency versions matched the lockfile, and the production
dependency audit returned no known advisories. The owner subsequently promoted
packaging environment isolation, preflight dependency consistency and native
toolchain provenance. Their implementation and 701-test preflight are complete;
the separate local packaging rehearsal is recorded in the
[build-reliability contract](plans/build-reliability.md). Persistent native helper
callback tests and extra dependency shadowing remain in the [deferred backlog](roadmap.md#deferred-product-and-review-backlog).
This is not a whole-repository correctness/security certification.

The owner subsequently promoted net arithmetic validation. Its source milestone
passes 713 tests (191 Swift, 455 engine, 67 Python) and focused independent review.
Version 0.2.29 completed that installation milestone; 0.2.30 subsequently adds
early balance publication with the preservation checks below complete.
See the [net-validation contract](plans/net-arithmetic-validation.md).

The temporary earnings preview crash on 30 September was caused by invalid
synthetic quote lifetime and forced loading in the preview harness. Its fixture
and error handling were corrected and the preview rechecked, then removed.
It did not involve the installed app or personal history.

## Early balance publication

Version 0.2.30 publishes validated balances and available holdings estimates
before reading optional closed/funded accounting chains. Interim net stays unknown;
the chart retains its prior dated view only for matching identity/timezone, keeping
older-week selection stable without mixing old holdings into new balances.

The 722-test preflight and independent review pass. The reviewer compared 28
synthetic cases with the old publisher and found identical final views. A native
production-controller harness verified held publication, queued-refresh ordering,
the actual 35-second timeout with recovery, reward deduplication, startup cache
ordering and ignored late writes after stop. Window and widget were inspected.
See the [contract and proof](plans/early-balance-publication.md).

The old and new packaged helpers also produced identical final balances,
provenance, recorded history and accounting/earnings for the existing profile.
Before replacement, a consistent private SQLite/state backup and the previous
0.2.29 app were retained. All 37,547 prior observations and 313 reward entries
survived; ten state files were unchanged during replacement and five static
settings stayed unchanged afterward. New finalized observations and current
accounting resumed. The installed Overview kept an older week selected through
live refreshes; latest Overview and widget retained seven validated daily nets.
The installed app matches the scanned universal ZIP/DMG candidate.

## Net arithmetic validation

Version 0.2.29 checks supplied daily and cumulative net USD against reward value
minus historical spend. Exact signed microdollar arithmetic preserves large
values, negative amounts and negative zero. A one-microdollar residual is allowed
because the producer rounds all three values independently; larger discrepancies
and hidden nonzero sub-microdollar precision reject the publication. Missing net
remains unknown, and this consistency check does not certify underlying history.

The 713-test preflight, independent review, production-controller failure/recovery
harness, synthetic window/widget inspection and universal package validation pass.
The previous and candidate packaged helpers returned identical complete earnings
for the existing profile; the new native boundary accepted all seven daily nets.
See the [contract and proof](plans/net-arithmetic-validation.md).

Before replacement, a consistent private SQLite/state backup and the previous
0.2.28 app were retained. All 37,447 prior observations and 313 reward entries
survived. Ten state files were unchanged during replacement and five static
settings stayed unchanged after launch. Fresh finalized monitoring and current
accounting resumed; the installed Overview loaded the latest and older verified
weeks, and the widget retained seven daily net values. The installed app matches
the scanned candidate. No history migration or restore was performed, and
Developer ID signing and notarization remain on hold.

## Claimed principal and refining fees

The 0.2.28 update adds an exact claim breakdown to covered earnings in the window
and widget: claimed principal, claimed refined rewards, refining fee, referral
fee and owner receipt. One isolated supported claim must have complete committed
replay, matching miner factors and counters, and no other successful miner activity.
Every claim in a day's covered range must be proved; missing, mixed, multiple-in-one
or inconsistent evidence leaves the breakdown unavailable. Claimed carry-in is not
new income. Existing daily net, unknown accrual splits and cumulative-profit limits
remain unchanged; raw receipts, anchors and ledger bytes are not migrated.

The 691-test preflight passed. Independent review caught a same-day record-loading
interaction that could broaden daily boundaries; the correction makes those records
attribution-only, and its regression plus focused recheck pass. Synthetic native
window/widget checks and the packaged offline helper verify all five exact amounts,
no double deduction, older-week loading and missing-evidence fallback. All eight
synthetic input files stayed unchanged. See the [contract and proof](plans/claimed-principal.md).

The previous and candidate packaged helpers produced identical complete earnings
for the existing profile before replacement. All 37,185 prior observations and
312 reward entries survived; ten state files were unchanged during replacement
and five static settings stayed unchanged after launch. Fresh finalized monitoring
and current accounting resumed, and the installed window/widget retained seven
covered days, including after restart. The live profile still follows legacy closed accounting,
so claim attribution is tested synthetically without making a wallet transaction.
The previous 0.2.27 app and consistent private database/state backup are retained.
Developer ID signing and notarization remain on hold; nothing was published.

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

The 0.2.25 update added previous/next/latest seven-day navigation inside **Verified
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
backup remain available. Older-week navigation followed in 0.2.25 and supported
claims/isolated principal attribution in 0.2.27–0.2.28. Pre-anchor reconstruction
remains deferred. See the
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
At the 0.2.22 installation check, the live profile followed the closed path;
funded behavior was verified with synthetic transaction fixtures, without
funding or operating a miner.


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
upgrade added 0.2.18; the 11 October upgrades add 0.2.19 through 0.2.28 and retain the
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
