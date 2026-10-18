# Contribution checks

Contributing does not require a paid GitHub plan. GitHub Free supports unlimited
collaborators. This repository is public: contributors can fork the source and
propose a pull request. [GitHub account options](https://docs.github.com/en/get-started/learning-about-github/types-of-github-accounts).

CI means **continuous integration**: GitHub runs the build and tests on a proposed
change so a reviewer can see whether it breaks existing behavior. It does not
publish an app, grant merge permission, or replace review.

## Run checks without credentials

Follow the [development setup](development.md), create a branch for one change,
then run:

```sh
npm ci --ignore-scripts --prefix engine
python3 scripts/check.py
```

The complete check requires macOS. Linux contributors can run
`python3 scripts/check.py --suite portable` and state that Swift validation is
still pending. Tests use synthetic fixtures: no wallet, Helius key, accounting
history, Apple Developer membership, or signing identity is needed.

Push the branch to a repository you can access and open a pull request against
`main`, using the [PR template](../.github/pull_request_template.md). Include the
commands run and their results; omit private logs and real wallet screenshots.
The [contributor contract](../CONTRIBUTING.md) explains the review boundaries.

## What GitHub runs

All jobs below run on public `main` pushes, pull requests and manual dispatches.
Their job-level conditions still refuse private-repository execution before
assigning a runner. Historical private runs skipped all jobs; a skip proves no tests.
[Job conditions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions).

| Check | Where | What it proves |
| --- | --- | --- |
| `native` | Standard Apple silicon macOS 15 runner | Swift compilation and unit tests on arm64 |
| `native-intel` | Standard Intel macOS 15 runner, public repositories only | Swift compilation and unit tests on x86_64 |
| `engine` | Standard Ubuntu 24.04 runner | Engine and Python tests, Node pin, local documentation links and source privacy |

The two native jobs verify the actual processor architecture before testing.
All three checks must execute and pass for a pull request to merge. Hosted checks do not exercise the installed
app, native UI, notifications, login items, notarization, or a clean recipient
Mac. Those remain [release checks](releasing.md).

The workflow uses `pull_request`, read-only repository permissions, pinned
actions, and checkout without persistent credentials. Tests need no repository
secrets. There is no signing, release upload, or automatic merge. New pushes
cancel an older run on the same branch or PR.

## Costs and failed checks

Standard GitHub-hosted runners are free for public repositories. Private
repositories receive an allowance; GitHub Free currently includes 2,000 monthly
minutes, with runner-dependent usage rates. Larger runners are chargeable even
for public repositories. This workflow uses standard runners and uploads no
build artifacts. To avoid depending on a remaining private allowance or a billing
limit, every job requires public repository visibility. The workflow never changes
visibility. [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

The 30 September private-alpha run was blocked before any native or engine test
steps by an account billing/spending-limit annotation. Hosted jobs resumed with
the 11 October source synchronization, before the owner requested avoiding paid CI.
The workflow now skips all private-repository jobs; [current status](current-status.md)
records the executed runs separately. Local checks remain available. A billing
block is neither a failing test nor passing evidence, and changing visibility
is reserved for the owner's final release decision.

| Result | Next step |
| --- | --- |
| A build or test step fails | Read that step, reproduce locally, and fix the change. |
| No steps start; the annotation mentions billing or spending limits | The repository owner checks account billing. Contributors do not need to pay. |
| A fork PR is awaiting approval | A maintainer reviews the proposed changes, including workflow edits, before approving execution. |
| A superseded run is cancelled | Review the replacement run for the current commit. |
| All jobs are skipped on the private alpha | Expected cost guard; use local preflight. This is not hosted test evidence. |

For public fork PRs, GitHub withholds repository secrets and provides a read-only
token. This repository requires maintainer workflow approval for **all external
contributors**, including contributors whose earlier pull requests were merged. Keep contributor tests on isolated GitHub-hosted
runners; do not run untrusted PR code on a personal Mac or switch to
`pull_request_target` to bypass those restrictions.
[Fork workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).

## Maintainer setup after approved public launch

Configured and read back on **18 October 2026**, after the owner approved public
source at `0e0a0ae`. See the [publication record](plans/public-source-launch.md)
for the exact hosted runs and verification limits.

- **Security reports:** [Private Vulnerability Reporting](https://github.com/ivnv00/godl-monitor/security/advisories/new)
  is enabled and its link is visible on the public Security page. Follow
  [SECURITY.md](../SECURITY.md); never report a vulnerability in a public issue.
- **Actions:** enabled for GitHub-owned actions, with full commit-SHA pinning
  required. Other third-party actions need a deliberate settings review. The
  default token is read-only and cannot create approving PR reviews. Every
  external fork contributor requires maintainer approval before workflows run.
- **Protected `main`:** pull requests, resolved conversations and up-to-date
  `native`, `native-intel` and `engine` checks are required. Checks must come
  from the GitHub Actions app. Administrators are included; force pushes and
  branch deletion are disabled. No bypass allowance or automatic merge is added.
- **Reviews:** no separate approval count is imposed on the sole maintainer;
  PRs and all required checks still apply. Review every contribution, particularly
  workflow changes, before merging or approving external workflow execution.

When changing job names or CI providers, update the required checks and verify
that a pending/failed check blocks merge before accepting community changes.
A real external contributor's fork approval journey remains untested; same-repo
PR evidence and settings readback do not substitute for that identity boundary.

[Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
and [branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
