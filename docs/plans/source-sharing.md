# Source-sharing preparation — 18 October 2026

## Decision and scope

Prepare GODL Monitor for sharing as a source-build alpha that people can build,
install and contribute to. The owner chose not to use Developer ID signing or
Apple notarization and confirmed permission to include the existing GODL artwork
in shared source. The artwork stays outside the MIT source grant.

The starting repository revision is `d7078078968ffde143041f950d8e9a93baebb81b`.
The installed app remains 0.2.39/build 42 from `2bfd15f`; this task does not launch
or replace it, alter personal settings or migrate financial evidence.

## Invariants and completion contract

- Preserve read-only operation, exact amounts, unknown coverage and isolated
  profiles. Use synthetic fixtures only. No new product features or redesign.
- Keep private keys, endpoints, wallet identifiers, personal paths and real
  history out of source, reachable history, screenshots and generic packages.
- Verify the documented source-build path, complete local checks, dependency
  audit, Git-history privacy, image review and independent Daybreak Blue review.
- Resolve confirmed security/data-loss/core-journey blockers. Record nonblocking
  findings in the roadmap with an explicit disposition.
- Describe tested platforms and unverified behavior accurately. Source sharing
  does not claim a notarized download, Intel hardware certification, minimum-OS
  coverage, automatic accounting reconstruction or whole-wallet profit.
- Leave a clean committed repository. Keep visibility private and publish no
  binary, release, Pages or announcement without final owner approval.

## Ordering and rollback

Review the existing state and history; update installation, contributor and
rights guidance; review security; correct in-scope blockers; run required gates;
commit the source candidate; build and inspect it from a fresh clone; record the
exact evidence. Documentation/package-guide rollback is an ordinary Git revert.
No installed-app rollback or data restore is needed because neither is changed.

## Verification record

Preparation is in progress. Record exact source revision, executed checks,
security dispositions, artifact integrity and remaining limits here before
claiming readiness. Private review logs and scan inputs stay outside the repo.

## Final publication steps

The owner's final approval must name the source revision and sharing destination.
Only after public visibility is explicitly approved: enable and verify GitHub
Private Vulnerability Reporting, execute the public-only CI jobs and configure
merge protection from their actual check names. Do not count private-job skips
as tests. See [Releasing](../releasing.md) and
[Contribution checks](../contribution-checks.md).
