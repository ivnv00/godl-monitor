# Read-only GODL claim evidence

Owner-approved on 11 October 2026, after exact current-holdings USD validation.
This is an offline evidence inspector, not a claim executor or a change to net
accounting. Developer ID signing and notarization remain on hold.

## Supported boundary

Project one successful, standalone, owner-paid GODL claim from a saved compiled
`getTransaction` response. Support legacy and version-0 loaded account keys,
existing recipient/miner-extended accounts, and the optional referrer route.
Compute-budget instructions may accompany the claim. Account creation, rent
top-ups, sponsored claims, mixed transactions and other CPI routes remain
unavailable in this first slice. A rejection must not supply a partial receipt.

Prove the exact GODL received by the owner and any referral transfer by matching
instruction roles, treasury SPL transfers and raw pre/post token balances. Prove
the owner's network fee separately. Report zero new-account rent only on the
supported route with no non-owner lamport movement or creation instructions.
Never infer a refining deduction or mined-principal amount from tokens received.

## Primary-source check

The public program metadata checked on 11 October still names source commit
`4b7bb4c6619d25f52ef9152de906a46027995143`, matching the existing decoder pin.
The program is upgradeable; third-party build metadata is not a local build or
security audit. No unlicensed source files are redistributed.

- The pinned [instruction enum](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/api/src/instruction.rs)
  and [SDK](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/api/src/sdk.rs)
  define ClaimGODL as discriminator 4 and its 12/14-account route.
- The [claim handler](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/miner/claim_godl.rs)
  checks the recipient ATA, treasury token account and optional referrer account;
  it sends the referral transfer and then the remaining owner receipt.
- The [miner state implementation](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/api/src/state/miner.rs)
  combines unrefined and refined amounts, can deduct a refining fee, resets both
  balances and changes the lifetime counter. Receipt alone cannot recover the
  original mined-principal attribution.
- [Solana JSON structures](https://solana.com/docs/rpc/json-structures) define
  compiled account indices, loaded addresses and raw token balance strings.
  Floating `uiAmount` and log messages are not monetary evidence.
- The pinned [Cargo lock](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/Cargo.lock)
  selects Steel 4.0.9 and its SPL Token 2022 7.0.0 constructor. Published crate
  sources confirm the inner Transfer carries source, destination and the treasury
  authority twice. Generated fixtures retain this repeated account index.

## Interfaces and invariants

- Add a separate `projectGodlClaim(result, {wallet, expectedSignature,
  expectedSlot})` module. Reuse the existing transaction envelope validator;
  leave its output and all existing receipt/ledger hashes unchanged.
- Require the owner signer/fee payer, canonical program/PDAs/ATAs, exact mint and
  decimals, complete token metadata and matching inner transfer amounts. Reject
  ambiguity, duplicate outer claim roles, unrelated transfers and token or SOL movement.
  All raw amounts use canonical u64 strings and BigInt arithmetic.
- Observed output identifies its schema, source pin, signature and slot, exact
  owner/referral receipts and SOL fee/rent, with principal and refining deduction
  explicitly unavailable. Unsupported evidence returns unavailable with a bounded
  reason; malformed evidence fails closed. No USD estimate or earnings inference.
- Add an offline `claim-evidence-cli.mjs --wallet PUBLIC_KEY --record FILE`
  for an existing saved RPC record. Check its raw digest, JSON-RPC identity,
  successful HTTP envelope, requested finalized JSON encoding and signature.
  This validates supplied evidence, not independent chain authenticity: a saved
  response alone does not prove mainnet or finality. Keep that limit in output.
- No network calls, writes, imports, profile discovery, migrations or persisted
  claim cache. Do not echo private raw responses, endpoint paths or local paths
  in errors. Keep fixtures generated and synthetic; bundle only generic helpers.

## Verification and rollback

Test through projector and offline CLI: exact large amounts, zero receipt,
referral rounding, legacy/v0, wrong identity/mint/roles, missing or duplicate token
metadata, inconsistent transfer/balance evidence, failed/inner/multiple/mixed
claims, account creation/rent movement and malformed saved envelopes. Verify
input bytes remain unchanged and network access is unnecessary.

Run all repository gates and one independent monetary/integration review. Package
with the holdings fix as the next local universal update; retain the prior app
and a consistent private backup, then verify every old observation/reward and
static setting plus fresh monitoring. Rollback replaces the app only. Existing
claim boundaries in historical accounting remain closed; a later versioned
principal bridge needs its own monetary contract and proof.

## Source milestone evidence

Projector and CLI checks pass 80 tests, including malformed and unsupported
subcases. The complete preflight passes 513 tests: 171 Swift, 285 engine and
57 Python, plus source/index privacy and documentation checks. The transfer
fixture first failed with the verified four-account ABI, then passed after
the decoder adopted it. Three-account transfers remain unsupported.

Independent review found no actionable issues and additionally checked nonzero
pre-existing token holdings and alternate version-0 account partitioning. No
existing transaction projection, receipt, ledger or accounting implementation
changed. The offline CLI verifies unchanged input bytes and permissions, exact
unsafe RPC integers and generic private diagnostics. These are synthetic and
source-contract proofs, not independent verification of a live claim.

The holdings fix and generic claim helpers form the 0.2.26 local candidate.
Installed-app and package preservation evidence is recorded in
[current status](../current-status.md) after replacement.
