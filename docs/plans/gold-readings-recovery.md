# Gold readings recovery

The reported earnings corruption has two reproduced inputs: a qualifying DEX
pool supplied an implausible XAUt0 USD price, and a subsequent program upgrade
changed the config account length, stopping fresh observations.

## Delivery contract

- Validate XAUt0 DEX quotes against an independent, timestamped CoinGecko
  `tether-gold` USD reference. Admit a DEX price only within 10% of the reference,
  using exact decimal comparison. This is a disagreement circuit breaker, not
  proof of an executable sale price or token backing.
- Require the reference to be no older than ten minutes, reject future timestamps,
  and never extend its validity by caching or retrying. Missing, stale, malformed
  or disagreeing gold prices leave gold-dependent USD amounts unavailable;
  native amounts and independently valid GODL quotes remain available.
- Apply the same rule to fetched quotes, old caches, earnings projection and the
  native publication boundary. Old unverified gold quotes cannot survive restart.
- Reconcile current account layouts and reward formulas with the verified program
  source before reading current balances. Preserve legacy snapshot decoding and
  immutable accounting evidence. Unsupported accounting transitions stay unknown.
- Preserve profiles, settings, observation rows and reward journal entries. No
  wallet transactions, signing, claims or automatic historical reconstruction.

## Proof and rollback

Use synthetic regressions for absurd/deep pools, exact tolerance boundaries,
missing/stale references, cache restart/failure and native rejection. Verify
legacy/current layouts and unexpected-layout rejection. Run the repository
preflight, inspect window/widget, validate private-free packaging and compare
preserved local state before and after the installed upgrade. Retain a consistent
private database/state backup and previous app. Roll back the binary only; never
overwrite newly observed history with an older backup.

## Source verification

On 16 October, the [program verifier](https://verify.osec.io/status/mineWsRs2Rmw2jPMkVbgAbDjV1E23yQ8TEodaX3iza4)
reported deployed source `8cbbc86341445d11e3779dfd5be9363474d75683` with matching
executable/on-chain hash. This is third-party build evidence, not a local
reproduction or audit. Finalized account reads confirmed Config is 232 bytes.
The [frozen Config offsets](https://github.com/zenx-labs/godl-program/blob/8cbbc86341445d11e3779dfd5be9363474d75683/api/src/state/config.rs)
append two u64 timing fields and 32 reserved bytes to the original 184 bytes.
All seven other observed layouts and reward settlement formulas are unchanged.
Decoder provenance identifies the supported source for the observed layout;
accounting independently checks deployment and remains pinned to the original ABI.
The exact known program/new-source pair shares the old reward-journal identity
because its reward semantics are unchanged. This preserves recorded earnings and
read states without rewriting saved entries; unknown sources remain isolated.

[DEX Screener's API](https://docs.dexscreener.com/api/reference) supplies exact-mint
pool quotes. [CoinGecko's timestamp guidance](https://support.coingecko.com/articles/7785031254-how-can-i-determine-if-the-pricing-data-for-the-coin-is-outdated-or-stale)
defines `include_last_updated_at=true` for checking reference freshness. Neither
provider agreement nor liquidity thresholds establish a realizable sale price.

## Source milestone evidence

The final local preflight passes 740 tests: 201 Swift, 472 engine and 67 Python,
including source privacy and local documentation links. Synthetic regressions
cover implausible deepest pools, exact tolerance boundaries, missing/future/stale
references, legacy cache restart, failure retention, short reference expiry,
native rejection and exact Config layouts. A native production-loader check
accepts a fresh current publication plus an older verified week without replacing
current holdings with historical balances.

One independent review and a focused correction/recheck cover the milestone.
The decoder-source change initially hid prior reward identities from Activity;
the exact supported compatibility mapping corrects this without journal migration.
Restart, prior read state, exact catch-up and duplicate suppression pass. The
optional funded-history fallback status label remains a deferred P2 in the
[backlog](../roadmap.md#deferred-product-and-review-backlog).

The first universal packaging attempt stopped before installation: the current
Swift Build backend returned one shared release path for both target triples,
allowing the Intel build to overwrite the Apple silicon result. The builder now
uses a separate scratch directory per architecture and verifies each slice before
combining. The actual two-architecture temporary-package regression checks both
outputs after both builds and executes only the host product; this does not claim
native Intel runtime validation.
