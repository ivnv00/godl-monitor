# Roadmap

GODL Monitor remains a private alpha. The current source can build a local
0.2.7 universal app, ZIP, and DMG with Apple silicon and Intel executable slices,
checksums, ad-hoc signatures, and package privacy checks. These local artifacts
are preparation evidence, not a public release or proof of native Intel use.

There are no promised dates. Community launch remains gated by the following
small, reviewable outcomes.

## Distribution and platform proof

- Add an authorized Developer ID signing and notarization path for the app and
  DMG; staple tickets and verify Gatekeeper acceptance.
- Test the core journeys on Intel hardware rather than relying on
  cross-compilation and static slice inspection.
- Test installation and core journeys without developer tools on
  clean Apple silicon and Intel Macs.
- Test macOS 14 for the documented minimum OS, plus a current macOS
  run, including first launch, widget, notifications, wallet switching, state
  preservation, unavailable states, and app replacement.

## Portable accounting confidence

- Replace omitted captured-history coverage with synthetic, portable journeys
  for accounting reconcile/restart/failure, checkpoint refresh and projection,
  earnings checkpoint loading, and ongoing extension validation.
- Provide and review an accounting-anchor onboarding journey for a community
  wallet. It must preserve the rule that monitoring works without an anchor and
  that the app never invents an opening cost basis.
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
