# Security policy

## Supported version

GODL Monitor is a public source-build alpha. There is no official binary release. Security fixes apply to the current `main`
branch; older local builds are not maintained as separate release lines.

## Report a vulnerability

Use [GitHub Private Vulnerability Reporting](https://github.com/ivnv00/godl-monitor/security/advisories/new),
also available under **Security → Report a vulnerability**. This channel was
enabled and verified on 18 October 2026. Reports are private to the maintainer
and invited collaborators until an advisory is deliberately published. Do not
open a public issue or pull request for a suspected vulnerability.

GitHub sign-in is required to submit a report. If the reporting page is unavailable,
repository collaborators can use an existing trusted private channel to the owner.
Do not put sensitive details in a public issue while seeking help.

Never send a recovery phrase, private key, RPC API key, complete RPC URL, wallet-specific accounting evidence, or application-support archive. Redact public wallet addresses, derived accounts, balances, transaction signatures, and local paths unless a specific value is essential; prefer synthetic reproduction data.

Include:

- the affected source revision and macOS version;
- a concise impact statement;
- minimal reproduction steps;
- the smallest redacted or synthetic evidence needed to verify the issue.

## Security boundary

GODL Monitor should remain read-only. It does not connect wallets, sign transactions, claim rewards, or control mining. The optional HTTPS RPC setting is stored locally with owner-only file permissions (`0600`), but it is not stored in Keychain or encrypted at rest.

The intended installation path is to review the source and build locally.
Builds are ad-hoc signed and are not Developer ID signed or Apple notarized.
No Apple Developer membership is required. A checksum verifies bytes, not the
identity or trustworthiness of whoever supplied them. See
[source-sharing checks](docs/releasing.md) and [installation guidance](docs/getting-started.md).
