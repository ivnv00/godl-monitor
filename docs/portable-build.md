# Portable Mac build contract

Prepare one local universal app for Apple silicon and Intel, with a ZIP and a
read-only drag-to-Applications DMG. No wallet settings, API keys, local history or
accounting evidence belong in either artifact. The recipient supplies their own
public address and optional RPC in the existing first-run flow. No server,
Terminal, Node installation, account, signing key or wallet connection is needed
to run the packaged app.

The builder combines separately compiled arm64/x86_64 Swift executables and
checksum-verified official Node runtime slices. Native dependencies must match
both architectures; do not silently ship host-only add-ons. Preserve notices,
architecture-specific provenance, resource bundles, and ad-hoc signature checks.
Write SHA-256 sidecars for the exact candidates. Existing local arm64 packaging
continues to work. Read-only DMG creation must not modify the installed app or
application-support data.

Verify both executable slices, OS deployment targets, signatures, packaged
runtime/engine execution on the host, source/archive privacy, and read-only DMG
contents. Cross-compilation is not hardware validation: Intel execution and clean
Mac installation stay explicit release gates if an Intel host is unavailable.

No GitHub release/upload, Apple notarization submission, developer enrollment,
visibility change, auto-update endpoint or publication is authorized by this
work. Keep the repository private and prepare the result for final owner review.
