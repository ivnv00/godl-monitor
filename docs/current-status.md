# Current status

Reconciled on **11 October 2026**. Start here for continuation; the roadmap
tracks remaining work and the dated review documents retain historical evidence.

Developer ID signing and notarization are on the owner's hold pending Apple
Developer membership. Local development and ad-hoc packages continue.

## Working baseline

- The project is a **private, read-only macOS alpha**. No public release,
  transaction controls, wallet connection, signing, claims or mining execution.
- The installed app and retained local universal installers are **0.2.19,
  build 21**, built from app-source commit
  `30a377eff960777248d0113875ed9437f872a458`. Subsequent documentation-only
  commits do not change that installed binary's provenance.
- Warm Ledger is the native design authority. The menu-bar recorded-rewards
  card has one heading, a prominent estimate, compact asset amounts and a
  visible before-fees-and-costs qualifier. Clicking opens recorded daily history;
  verified net and covered accounting amounts remain separately expandable.
- Local upgrades through 0.2.19 preserved saved profiles, settings,
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

The 11 October full preflight passes **328 tests: 133 Swift, 138 engine and 57 Python**.
Native and universal release compilation use warnings as errors. Source, index,
reachable history and generic ZIP privacy checks pass. The ZIP and read-only
mounted DMG contain 353 matching app files; the installed app's ad-hoc signature
and both installer checksums validate.

| Artifact | SHA-256 |
| --- | --- |
| 0.2.19 universal ZIP | `161206d610d7ccb1cffcc6aa2e430228643c91dd13a9948af79b1ab1ac11218b` |
| 0.2.19 universal DMG | `5b18d97c85bbc4e02e4be0993fd6ed15dea552b713d55ea386e4d0574ecd8c3d` |

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
upgrade added 0.2.18; the 11 October upgrade adds 0.2.19 and retains the
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
