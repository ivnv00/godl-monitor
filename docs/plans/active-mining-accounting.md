# Active-mining accounting change brief

Owner-approved sequence, 11 October 2026: deliver current GODL/SOL validation
first (installed 0.2.20), then improve accounting during mining. Developer ID
signing and notarization remain on hold. Historical reconstruction is separate.

## First correction: settled deployment markers

The pinned program leaves `miner.deployed` populated after checkpointing. It
sets `checkpoint_id` to `round_id`; subsequent checkpoint calls return without
rewarding again. The next deployment clears the grid. The old monitor therefore
rejects some fully settled states indefinitely.

At source `4b7bb4c6619d25f52ef9152de906a46027995143`, see
[checkpoint handler](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/miner/checkpoint_with_miner_extended.rs)
and [deployment handler](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/miner/deploy_with_miner_extended.rs).
Public source/verifier metadata rechecked on 11 October still matches this
revision; third-party reproducible-build evidence is not a security audit.

Admit a nonzero grid to the closed boundary only when both round markers are
canonical unsigned u64 strings and exactly equal. Keep the existing zero-grid
case, absent automations, zero stored SOL, finalized mainnet, pinned program,
ownership, full transaction coverage, claim and price guards. Expired-round
checkpointing can forfeit rewards; equality proves no pending reward, not a win.
Use the same boundary for reviewed period generation and ongoing checkpoints.

No schema change, invented reserve valuation, history rewrite or new starting
balance. Existing v1 receipts retain their cash-basis meaning and exact hashes.
On failure retain the last verified receipt. Test nonzero settled grids, pending
and malformed markers, pooled/forfeited terminal markers, zero-grid legacy
compatibility, service restart/repeated slots and unchanged receipt arithmetic.

Validate with synthetic fixtures first, then read-only private evidence replay;
run full repository gates and one independent review before a local update.
Retain the preceding app and a consistent state/database backup. Rollback replaces
only the binary, preserving newer history. The older 0.2.20 app cannot validate
a newly saved terminal nonzero-grid checkpoint: its balances/history still work,
but accounting falls back to the original reviewed receipt and cannot advance.
Reinstall the corrected binary to resume; do not restore an old checkpoint over
newer evidence merely to make a downgrade calculate again.

## Gold claims within the closed interval

A private replay exposed a second core blocker: `ClaimGold` (opcode 64) was
classified as unsupported even though the pinned handler reads unrefined principal
without mutating it. Exclude a standalone outer gold claim from unrefined mining
cost only when its owner/miner/extended roles match and no tracked owned SOL
balance changes. Its recipient rent and claim fee are outside this accounting
scope. A lazy extended-account creation, mixed GODL instructions or owned SOL
movement still fails closed. See the pinned
[gold claim handler](https://github.com/zenx-labs/godl-program/blob/4b7bb4c6619d25f52ef9152de906a46027995143/program/src/gold/claim_gold.rs).
Synthetic regressions and private offline replay cover this correction; actual
provider retries still preserve the last verified checkpoint. The private full
refresh subsequently reached `current` with complete captured transaction coverage.

Deferred P2: price collection still requests candles for excluded gold-claim
wallet movements. A missing optional candle can delay reconciliation even though
the pure calculator does not charge that claim. This did not prevent the verified
private refresh and does not change the accepted amounts.

## Delivered scope: funded terminal rounds

Funded automation now has a distinct ledger seeded by the latest validated
closed receipt. Pending rounds and stored SOL remain outside the accepted
boundary; they keep the previous dated result until settlement. This is the
bounded accounting improvement described below, not a reconstruction of older
uncovered days or a whole-wallet profit report.

## Funded terminal-round ledger contract

The approved second seam admits funded automation at a terminal round, while
still withholding new net figures for pending rounds or stored unclaimed SOL.
For each supported transaction, exact recognized cost is the negative sum of
wallet, automation and automationV2 lamport changes. Full automation lamports
include refundable rent. Deposits and refunds cancel inside owner custody;
consumption and actual net SOL returns affect cost. Network fees are already in
wallet deltas and are not added twice. Miner rent and prepaid checkpoint fees keep
the existing cash-basis treatment. A checkpoint fee may later return to an owner
signer; that actual wallet return offsets cost. Keeper payout never charges twice.

The immutable reviewed v1 prefix keeps its original historical USD basis. The
new suffix uses SOL minute-close prices at consumption/return events, including
those without a wallet movement. This is an event-price estimate, not a fiat
acquisition basis, pending reward estimate or whole-wallet profit. No reserve
price inventory or invented exchange gain is introduced.

A `godl-funded-accounting-checkpoint` sidecar at the existing checkpoint path plus
`.funded.json` stores the original closed anchor, terminal snapshot, cumulative
integer costs and hash-linked interval evidence. Its ledger hashes the full
closing snapshot and reviewed receipt. Once present, it owns every later suffix,
even after automation closes. The old closed checkpoint stays frozen. Corrupt or
unsupported sidecars fail before any RPC/write, without fallback or replacement.
One existing writer lock serializes both modes; evidence is written before the
atomic sidecar update. Before replacing a persisted funded head, the writer
records its ledger hash in a private commit marker. Readers admit only that head
or marked ancestors: interrupted, unpublished evidence cannot create a false
fork, while conflicting published children still fail closed. A first funded bootstrap also persists the frozen closed
anchor so readers can verify both identities.

Native earnings normalize separately validated closed and funded endpoints;
wire values remain exact and partial-day. Missing active evidence falls back to
the explicitly dated closed history and its status. Gross balances/quotes stay
independent. The legacy acquisition-period card remains dated to the closed
prefix; new cumulative/daily earnings disclose automation-capital exclusion.

Test matrix: funding plus refundable rent, consumption without wallet movement,
changed event prices, refunds/closure, actual SOL return routes, failed owner and
keeper fees, checkpoint prepayment, malformed reserves, pending rounds, missing
prices/transactions, restart and interrupted publication, corrupt sidecar, immutable v1 prefix, hash/slot
forks and gaps, mixed daily endpoints and expired quotes. Full native/engine/privacy
and package gates plus one independent funded-ledger review precede installation.
The app remains read-only; history reconstruction and claims/mining controls are
outside scope. Rollback to 0.2.21 preserves the sidecar but cannot continue its
accounting; restore the new binary before advancing it again. A changed frozen
closed prefix is detected and blocks the funded ledger instead of merging two
accounting bases.
