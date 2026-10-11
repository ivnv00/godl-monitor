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

## Following seam: funded and unsettled mining

Genuinely active automations, pending deployments and stored SOL need a distinct
ledger seeded by the latest validated closed receipt. Funding is recoverable
capital, not realized mining spend. Keep its versioned state and evidence separate
from v1 receipts; preserve the old app's rollback compatibility. Establish reserve
basis, fees, refunds and pending-round treatment from transaction evidence before
exposing a new net figure. Missing coverage or unknown opening reserves stay
unknown. Consumed reserves can move without owner-wallet cash flow, so historical
price collection must cover those events too. The implementation and validation
matrix for this seam will be recorded here before edits begin.
