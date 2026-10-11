# Claimed principal and refining-fee attribution

Owner-authorized on 11 October 2026; Developer ID signing and notarization stay
on hold. This is a read-only breakdown of covered claims, not a new income or
cost-basis calculation.

## Contract and invariants

Preserve all observations, reviewed anchors, receipt/ledger bytes and hashes.
Derive optional schema-3 earnings metadata from existing committed reconciliation
records. Do not alter the receipt-only inspector, combined GODL change, daily net,
unrefined/refined daily accruals or cumulative-profit rules. Failure of optional
attribution leaves existing valid accounting and current holdings available.

Admit a single supported claim between two saved observations only after complete
interval replay reproduces its committed costs, receipts and transaction lists.
No other successful transaction may involve the miner. Require unchanged unrelated
miner state, exact source/account/referrer continuity, closing unrefined and stored
refined balances of zero, and canonical non-regressing I80F48 miner factors.

For opening unrefined U, stored refined R, lifetime L and miner factor bits f0/f1:

```
E = floor((f1 - f0) * U / 2^48)
claimed principal = U
claimed refined rewards = R + E
refining fee = U + R + E - treasury debit
```

The fee must equal either zero or floor(U/10), and closing lifetime must equal
L + E - fee. Mirror intermediate I80F48/u64 bounds; no floating-point arithmetic.
The pinned handler stores the consumed miner factor before adding its own fee to
the treasury factor. Current treasury state cannot substitute for that factor.
Referral receipts remain separate; do not allocate referral deductions between
principal and refined rewards. Claimed principal may include earlier holdings.

Each displayed day's breakdown is available only when every covered claim has
isolated, validated attribution. Multiple claims within one evidence interval,
other miner activity, missing factors/records, inconsistencies and out-of-range
aggregates remain unavailable. Net and cumulative limits do not broaden.

## Ordering, proof and rollback

1. Exact isolated-claim projector and protocol-realistic synthetic vectors.
2. Reuse committed-interval replay for optional same-day and older-week metadata.
3. Native validation and shared window/widget claim breakdown.
4. Full repository gates, one independent integration review, generic universal
   package checks, consistent private backup, app replacement and preservation
   checks. Retain the prior app; rollback replaces the app without restoring an
   older database over new history.

Test the charged/exempt paths, factor truncation, zero/tiny/large amounts,
referral rounding, unchanged net/hash/input bytes, missing or corrupt evidence,
mixed/multiple claims, failed attempts, duplicates, day boundaries, optional
failure fallback, selected-week/live parity and native malformed-field rejection.

## Protocol evidence

Fresh public metadata on 11 October matches source commit
`4b7bb4c6619d25f52ef9152de906a46027995143`, SDK 0.1.3 and the pinned executable
hash. The program remains upgradeable. This is third-party verification metadata,
not an independent executable audit.

The claim settlement and factor ordering are defined in
[Miner::claim_godl / update_rewards](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/api/src/state/miner.rs).
The [claim handler](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/miner/claim_godl.rs)
has no claim-amount argument and pays the referral from the combined receipt.
Saved RPC evidence remains conditional provider evidence, not independent chain
authentication. Logs and claim timestamps do not establish principal or fees.

## Validation

The 11 October candidate passes 691 checks: 179 Swift, 455 engine and 57 Python.
Independent integration review found one P1 interaction: newly loaded same-day
claim records also supplied intermediate daily boundaries. Same-day records now
derive attribution only; all prior daily fields and boundaries remain unchanged.
The regression and focused independent recheck pass; cross-day recovery retains
its existing behavior.

A synthetic native production-controller harness loads an older week through
the bundled offline helper and validates all five exact amounts, unchanged net,
unknown daily accrual splits and unknown cumulative profit. Window and compact
widget inspections show the shared breakdown. Withholding optional evidence
keeps covered net and shows unknown claim components. No personal data or wallet
transaction is used in this proof. Package and upgrade evidence is recorded in
the [current status](../current-status.md) after local installation.
