# Roadmap

GODL Monitor remains a private alpha. The current source can build a local
0.2.17 universal app, ZIP, and DMG with Apple silicon and Intel executable slices,
checksums, ad-hoc signatures, and package privacy checks. These local artifacts
are preparation evidence, not a public release or proof of native Intel use.

There are no promised dates. Community launch remains gated by the following
small, reviewable outcomes. [Current status](current-status.md) separates the
installed baseline and latest local evidence from these remaining gates.

## Distribution and platform proof

- Exercise the prepared [Developer ID signing and notarization path](notarization.md)
  after choosing and reviewing its public signing identity, then obtaining
  explicit authorization for the candidate. Independent code review is complete;
  the preview, synthetic failure checks and local hardened-runtime rehearsal are
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
- Improve announcement of launch-at-login failures for VoiceOver. The fixed error
  text is accessible, but currently has no automatic announcement or focus handoff.
- Correct the P2 recovery copy when saving over unsupported wallet settings:
  existing data is preserved, but the later message incorrectly cites file
  permissions. See the [observed result](first-run-review.md#deferred-finding).

- Preserve Activity visibility across future decoder-source changes. A goals/activity
  backup retains older source identities, but the existing Activity filter only
  shows the active decoder identity (deferred P2; current candidates share it).

## Portable accounting confidence

- Portable synthetic journeys now cover accounting reconcile/restart/failure,
  checkpoint refresh/projection, earnings chain loading and extension validation.
  They also reject repeated finalized slots without creating duplicate receipts.
  See [coverage and limits](../engine/test-fixtures/README.md).
- Settings now supports local review and import of an already-reviewed accounting
  starting point without replacing history. Expert anchor preparation remains
  separate. Validate that preparation and the full onboarding journey with a
  community wallet before claiming broadly accessible net-accounting setup.
- Refine the recovery label for an accounting-only network identity mismatch;
  it currently uses generic guidance. The observation path already identifies
  a wrong Mainnet endpoint, and verified history remains preserved.
- Re-run native, engine, runtime, packaging, and source/archive privacy gates on
  the exact candidate revision.

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
