# Current status

Reconciled on **30 September 2026**. Start here for continuation; the roadmap
tracks remaining work and the dated review documents retain historical evidence.

## Working baseline

- The project is a **private, read-only macOS alpha**. No public release,
  transaction controls, wallet connection, signing, claims or mining execution.
- The installed app and retained local universal installers are **0.2.17,
  build 19**, built from app-source commit
  `8bd298ba8e176401843f91e6d792b63b912759e1`. Subsequent documentation-only
  commits do not change that installed binary's provenance.
- Warm Ledger is the native design authority. The menu-bar recorded-rewards
  card now has one heading, a prominent estimate, compact asset amounts and a
  visible before-fees-and-costs qualifier. Clicking opens accounting details.
- Local upgrades through 0.2.16 and 0.2.17 preserved saved profiles, settings,
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

The local full preflight passes **312 tests: 124 Swift, 131 engine and 57 Python**.
Native and universal release compilation use warnings as errors. Source, index,
reachable history and generic ZIP privacy checks pass. The installed app's 352
files match its ZIP; its ad-hoc signature and both installer checksums validate.

| Artifact | SHA-256 |
| --- | --- |
| 0.2.17 universal ZIP | `eda26fc39af709e6537dd937c3701074e9a51479ac852c3dd0cf6eeb57c42f26` |
| 0.2.17 universal DMG | `0c594efe3ee970ec6832b486558a46fc34045fe039e18e1e7b54a5cf53b56127` |

Both app and bundled Node contain arm64 and x86_64 slices. This proves packaging
and cross-compilation, not native Intel operation. The app targets macOS 14+;
the documented minimum still needs physical validation. Signing is local ad-hoc,
not Developer ID or Apple notarization.

Hosted GitHub checks remain blocked before test execution by an account
billing/spending-limit error. The private repository's Intel job is deliberately
skipped. Neither condition is passing CI evidence. There are no open PRs or
issues, no extra project branches/worktrees, and no release upload. `main` is the
integration branch and currently has no branch protection; verify its remote
SHA when continuing.

The temporary earnings preview crash on 30 September was caused by invalid
synthetic quote lifetime and forced loading in the preview harness. Its fixture
and error handling were corrected and the preview rechecked, then removed.
It did not involve the installed app or personal history.

## Cleanup and continuity

The 30 September cleanup removed obsolete preview preferences, generated preview
packages, compiler/dependency/runtime caches and synthetic test leftovers.
Only the installed 0.2.17 app and its current local installers are retained as
active builds. Recovery snapshots, original design handoffs, unique historical
source and review evidence are preserved privately rather than treated as caches.
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
