# Security policy

## Supported version

GODL Monitor is a private source-build alpha with no published release. Security fixes apply to the current private main branch; older local builds are not maintained as separate release lines.

## Report a vulnerability

If this repository's **Security** tab offers **Report a vulnerability**, use GitHub Private Vulnerability Reporting. Do not open a public issue for a suspected vulnerability.

If private reporting is not configured, this alpha does not publish a dedicated security contact. Repository collaborators should notify the owner through an existing trusted private channel without including secrets in GitHub issues or pull requests.

Never send a recovery phrase, private key, RPC API key, complete RPC URL, wallet-specific accounting evidence, or application-support archive. Redact public wallet addresses, derived accounts, balances, transaction signatures, and local paths unless a specific value is essential; prefer synthetic reproduction data.

Include:

- the affected source revision and macOS version;
- a concise impact statement;
- minimal reproduction steps;
- the smallest redacted or synthetic evidence needed to verify the issue.

## Security boundary

GODL Monitor should remain read-only. It does not connect wallets, sign transactions, claim rewards, or control mining. The optional HTTPS RPC setting is stored locally with owner-only file permissions (`0600`), but it is not stored in Keychain or encrypted at rest.

The app is currently ad-hoc signed for local source builds and is not Apple notarized. Do not treat a local ZIP as a trusted public release.
