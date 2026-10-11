# Pending-round and stored-SOL accounting

Owner-approved on 11 October 2026, following installed 0.2.22. Preserve all
observation/reward history and the reviewed cost prefix. Developer ID signing
and notarization remain on hold. Read-only throughout.

## Meaning and limits

Keep reconciled cash cost current during a pending round or while stored SOL is
unclaimed. Deployment leaves owner custody immediately, but the stake is not a
known loss: display its exact pending amount separately, without guessing a win,
refund or expiry. Exact matching round/checkpoint IDs remain terminal even when
the deployed grid is retained. A lagging marker with a zero grid has no pending
stake. Do not infer expiry from wall time or an unavailable round account.

Stored SOL is the exact gross `rewardsSol` amount, before claim deductions; it is
not rent or already received cash. Wallet claims and executor claim-and-fund use
different referral deductions, so this slice does not invent a single net receipt
or choose a route for the user. Credit only actual wallet/automation receipts in
the cash ledger. Show no current complete net while either pending stake or stored
SOL remains. Retain the explicitly dated last settled net and covered daily history.
Round/pool/referrer decoding, prospective reward simulation, whole-wallet profit,
and retrospective reconstruction are separate work.

Pinned source remains `4b7bb4c6619d25f52ef9152de906a46027995143`; public metadata
rechecked 11 October. See the [checkpoint handler](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/miner/checkpoint_with_miner_extended.rs),
[wallet SOL claim](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/miner/claim_sol.rs),
and [claim-and-fund](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/automation/claim_sol_and_fund_automation.rs).
Matching third-party build metadata is not a local reproduction or audit.

## Integer invariants and persistence

The cash formula remains `-(wallet + automation + automationV2 lamport deltas)`.
Funding/refunds inside custody cancel; spending and actual received SOL use event
prices. Network fees are already in those deltas. Retained miner cash is now
`miner lamports - checkpointFee - rewardsSol`: require it nonnegative and prevent
unexplained reductions. This separates checkpoint accrual, fee payout and later
claim from rent without crediting the same SOL twice.

Version 2 of the existing funded checkpoint/ledger permits pending and stored-SOL
endpoints. Version 1 retains its original terminal-only meaning and hashes. New
writes link to their exact prior ledger; the immutable closed anchor, old evidence,
commit markers and writer lock are preserved. Malformed or newer versions stop
before RPC or replacement. Existing no-automation, terminal, zero-SOL profiles
continue the closed path until an open boundary requires the sidecar. Once a
sidecar exists, it owns the suffix even after settlement.

Old 0.2.22 cannot read v2 sidecars and fails before replacing them. Its balances and
saved reward journal remain available, with dated closed accounting fallback.
Rollback replaces the binary only; never restore an old database/checkpoint over
new history. Reinstall the new binary to resume the sidecar.

## Publication contract

Earnings schema 1 remains unchanged. Schema 2 requires `position` with:

- `fromAt`, `throughAt`, `throughSlot`: exact verified cash coverage.
- `netSpendSol`: signed canonical nine-decimal string; `netSpendUsd`: signed
  six-decimal string at historical event prices.
- `pendingRound` optional: canonical u64 `roundId` and positive `deployedSol`
  (`lamports`, exact nine-decimal `display`). No field means no pending stake at
  this boundary; missing or malformed evidence does not manufacture this state.
- `storedSol`: nonnegative canonical u64 lamports and exact display, including zero.
- `netReady`: true exactly when pendingRound is absent and storedSol is zero.
- `reason`: explicit capital exclusion, stored gross SOL and unknown-outcome scope.

Daily net uses only terminal, zero-stored-SOL endpoints. Cumulative `total` stays
at the newest such endpoint, including the old anchor when needed. A later open
`position` is shown separately with its own timestamp; it never turns pending
rewards into zero. Missing funded evidence falls back to dated closed history and
its status. Independent holdings and recorded rewards remain available.

Native schema-2 validation checks coverage, canonical amounts, readiness and
that a displayed settled net does not use the open position's boundary. The full
window and compact daily details share a Warm Ledger position component; the
widget summary identifies outstanding amounts and retains access to exact costs.

## Verification and delivery

Synthetic transitions: pending spend → checkpointed SOL → wallet/automation
claim; loss/forfeiture marker; retained terminal grid; stored SOL plus new pending
round; claims and deployment within one interval; failed transactions; checkpoint
fee payout/recovery; custody underflow/unexplained reduction; zero/malformed data;
v1 → v2 hash continuity; restart, interrupted publication, provider/missing-price
failure and corrupt/newer sidecar preservation. Verify old settled daily history,
withheld current net, exact new costs and expired-price behavior.

Run focused tests while implementing, then Swift/engine/Python/privacy gates,
one independent review and its blocking-finding recheck if needed. Check native
window/widget with synthetic fixtures. Build a clean committed universal package;
verify signatures, contents and privacy. Before local installation retain the
previous app, consistent SQLite backup and all state JSON; after launch verify
all previous observations/reward entries and static settings plus fresh updates.

## Milestone evidence

The independent monetary review found no P0/P1 defects. One P3 test-realism
note is deferred: the publication transition fixture uses an owner-paid legacy
automation target for claim-and-fund; the pinned handler uses automationV2 and
may use an external executor. Both custody roles and keeper costs have separate
coverage, but their combined claim-and-new-deploy interval is not a protocol-realistic
end-to-end fixture. No implementation defect was established.

The native production loader/controller accepted generated schema-2 output with
current cash cost and gross stored SOL while cumulative net remained at the prior
settled slot. Shared position rendering also passed at full and compact widths
with one-lamport pending stake, a maximum-u64 stored amount and signed net receipts.

Full preflight: 370 tests (142 Swift, 171 engine, 57 Python), warnings-as-errors
builds and source/index/history/package privacy passed. Universal 0.2.23 build 25
was installed locally after signature, checksum and ZIP/DMG equivalence checks.
The previous binary and a consistent private backup are retained. All existing
observations, reward entries and static settings survived, fresh observations
resumed, and the installed Overview/widget retained their history. The live
profile is currently settled; no miner execution or claim was needed for proof.
