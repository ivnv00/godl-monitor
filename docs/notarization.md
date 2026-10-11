# Signing handoff

This is a **maintainer-only preparation path**, separate from the local builder.
The script defaults to a read-only preview. No Developer ID or Apple submission
has been exercised for GODL Monitor yet; existing candidates remain ad-hoc
signed. Signing and notarization need the owner's explicit approval for the
exact source revision and artifact. Publishing needs separate final approval.

**Owner hold:** Developer ID signing and notarization are paused pending Apple
Developer membership. Membership alone does not complete certificate setup,
public signing-identity review, candidate approval, Apple acceptance or the
platform checks in [Releasing](releasing.md). Resume only after the owner lifts
this hold and authorizes the exact candidate.

## Preview the reviewed input

Build and review a universal ZIP using [Releasing](releasing.md). Record its
complete SHA-256 and source commit independently before running this command;
do not derive an approval from whatever file happens to be present.

```sh
python3 scripts/notarize-candidate.py \
  --archive dist/GODL-Monitor-0.2.20-universal.zip \
  --sha256 "$REVIEWED_ZIP_SHA256" \
  --source-commit "$REVIEWED_SOURCE_COMMIT"
```

The variables stand for the previously reviewed values. Preview reads the ZIP,
checks its hash, safe paths, app identity and recorded runtime provenance. It
does not extract files, run bundled code, inspect signing identities, read a
Keychain profile or contact Apple. Preview success is not signature verification
or notarization acceptance.

## Prerequisites for an authorized run

- A clean committed checkout matching the reviewed candidate, with the full Git
  history, Python 3.12+ and the macOS developer tools.
- A valid **Developer ID Application** certificate and its private key already
  installed in the build Mac's Keychain. Use its SHA-1 fingerprint and expected
  ten-character developer team ID. An Apple Development certificate will fail.
- An existing `notarytool` Keychain profile for that team. After authorization,
  `xcrun notarytool store-credentials GODLNotary` prompts interactively. Never
  put a password, `.p8` key or certificate export in source, a command argument,
  a shell-history entry or a test fixture. Recipients need none of these.
- Owner review of the certificate's public identity: a distributed Developer ID
  signature exposes its certificate subject and team. A personal developer
  certificate can expose the developer's legal name. Repository privacy checks
  cannot hide certificate identity; choose an appropriate signing identity
  before distribution.
- Review the exact source and input ZIP for private material. The script repeats
  the history/archive scanner, including `PRIVATE_SCAN_VALUES` if supplied
  through the documented private in-memory review wrapper. Pattern scanning
  alone is not a complete privacy review.

## Execute only after approval

Set the following non-secret references to the reviewed certificate fingerprint,
team and pre-existing Keychain profile. The output directory must not exist;
its parent must exist. This command signs code and sends two artifacts to Apple.
The flags record operator intent; they do not replace owner approval.

```sh
python3 scripts/notarize-candidate.py \
  --archive dist/GODL-Monitor-0.2.20-universal.zip \
  --sha256 "$REVIEWED_ZIP_SHA256" \
  --source-commit "$REVIEWED_SOURCE_COMMIT" \
  --identity "$DEVELOPER_ID_FINGERPRINT" \
  --team-id "$DEVELOPER_TEAM_ID" \
  --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" \
  --output dist/notarization-attempt-1 \
  --execute --approve-apple-upload
```

The workflow preserves the input and installed app, then:

1. Copies the pinned ZIP into a new private attempt directory, rechecks it,
   scans privacy and verifies both executable slices and the existing signature.
2. Signs Node, then the outer app, with hardened runtime and secure timestamps.
   Only Node receives `com.apple.security.cs.allow-jit`; the Swift app receives
   no entitlements. Debugging, unsigned memory and library-validation exceptions
   are not inherited. The bundled Node hash is updated before signing the app.
3. Verifies the expected Developer ID team, entitlements and signatures on both
   slices; runs an offline JIT/SQLite/engine smoke check on the build host.
4. Submits the app ZIP, records its submission ID **before waiting**, requires
   Apple's `Accepted` result, then staples and validates the app's ticket and
   checks Gatekeeper. ZIP files themselves cannot carry a stapled ticket.
5. Creates the ZIP again from the stapled app. Builds and signs the DMG, submits
   it separately, requires acceptance, staples and validates it, then checks
   its integrity and Gatekeeper assessment.
6. Places completed files, SHA-256 sidecars and a provenance manifest in
   `dist/notarization-attempt-1/notarized/`. No GitHub upload, release, app
   installation or visibility change occurs.

Keep `work/` and `attempt.json` local. Share only separately approved final
artifacts; neither a successful Apple result nor this script grants publication
approval. Verify the final ZIP and mounted DMG contents, repeat the privacy
review, and complete clean-Mac, Intel and minimum-macOS checks in
[Releasing](releasing.md) before requesting publication.

## Interrupted or rejected attempts

The script stops at the first failure, retains the attempt directory and never
automatically retries or overwrites it. `attempt.json` identifies the stage,
artifact hash, submission IDs and status. Only the top-level `notarized/`
directory is a completed result; files under `work/` are intermediate.

Use a recorded ID with `xcrun notarytool info` or `log`, passing the same
`--keychain-profile`, to inspect Apple's result. If submission was interrupted
before an ID was returned, inspect `xcrun notarytool history` before deciding
whether another upload is needed. Losing the local wait does not cancel Apple's
processing. There is deliberately no automatic resume: retain the evidence,
resolve the failure and obtain approval before any new upload attempt.

## Evidence and limits

Synthetic tests cover the preview/execution boundary, input validation,
credential-reference requirements, command ordering, rejection and failed-stage
handling without signing credentials or Apple services. An offline ad-hoc
hardened-runtime rehearsal validates the narrow Node entitlement on the build
host. Neither proves Developer ID signing, notarization, Gatekeeper acceptance
or native Intel execution; those remain explicit release gates.
Independent review of the signing workflow completed at source revision
`7a038ef079dbb8f672f3685306429bd82ee61981`, with no blocking findings. The review
covered the approval boundary, input/extraction checks, signing identity and
entitlements, submission records, failed-attempt preservation, privacy scans
and final artifact promotion. All 24 distribution tests passed, and the pinned
0.2.10 candidate passed the read-only preview with its archive hash unchanged.

That review closes the code-review gate only. No signing credentials were used
and nothing was submitted to Apple. Re-review material changes to this workflow
before credential-backed execution. A candidate remains bound to its recorded
source commit: documentation updates do not rebind an existing archive to a
newer checkout. Use the matching reviewed checkout, or build and review a new
candidate before requesting authorization.

References: Apple's [notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow),
[signing requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
and [JIT entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.allow-jit).
