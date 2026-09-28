# Roadmap

GODL Monitor remains a private alpha. The current source can build a local
0.2.11 universal app, ZIP, and DMG with Apple silicon and Intel executable slices,
checksums, ad-hoc signatures, and package privacy checks. These local artifacts
are preparation evidence, not a public release or proof of native Intel use.

There are no promised dates. Community launch remains gated by the following
small, reviewable outcomes.

## Distribution and platform proof

- Exercise the prepared [Developer ID signing and notarization path](notarization.md)
  after choosing and reviewing its public signing identity, then obtaining
  explicit authorization for the candidate. Independent code review is complete;
  the preview, synthetic failure checks and local hardened-runtime rehearsal are
  preparation evidence. Real app/DMG tickets and Gatekeeper acceptance still
  need verification.
- Test the core journeys on Intel hardware rather than relying on
  cross-compilation and static slice inspection.
- Test installation and core journeys without developer tools on
  clean Apple silicon and Intel Macs.
- Test macOS 14 for the documented minimum OS, plus a current macOS
  run, including first launch, widget, notifications, wallet switching, state
  preservation, unavailable states, and app replacement.

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
  GitHub Actions billing and a branch-protection plan are currently unavailable;
  queued or billing-blocked jobs are not passing evidence.
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
