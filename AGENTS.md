# GODL Monitor contributor contract

This repository is a private preparation branch for a community release. Never
change repository visibility, publish releases, enable Pages, upload production
artifacts or add automatic publishing without the owner's explicit final approval.

- The app is read-only: no wallet connection, secrets, signing, claims or mining
  controls. Validate data and keep unknown values unknown.
- Preserve the Warm Ledger native design described in design.md. SwiftUI tokens
  and shared components are authoritative; inspect both the window and widget.
- User wallet addresses, private RPC URLs, accounting evidence, local paths and
  real balance history must stay outside the repository and packages. Use only
  generated synthetic fixtures in docs, tests and screenshots.
- Keep wallet profiles isolated. Never overwrite unreadable or unsupported local
  settings. Preserve the existing user's local state during upgrades.
- Progress and monetary values use exact decimal/integer math. Never fabricate
  a starting balance, cost basis, full-day return or all-wallet profit figure.
- Run Swift tests, engine tests and scripts/check-privacy.py before committing.
  Validate generic packages contain no wallet, endpoints or runtime files.
- Public-release blockers, platform support and accounting limits must remain
  explicit in documentation. Local ad-hoc signing is not Apple notarization.
