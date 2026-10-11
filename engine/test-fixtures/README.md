# Portable engine test fixtures

This directory intentionally contains no captured wallet, RPC, transaction, or
accounting history.

`accounting.mjs` generates a fictional reviewed anchor and a mining interval from
a repeated-byte public key and its derived protocol accounts. No private key is
created. Costs, fees and rewards use small, hand-computable quantities.
`accounting-rpc.mjs` supplies in-memory account bytes and transaction responses;
the CLI integration test serves them only on loopback. Unexpected methods fail
instead of contacting a live provider. Historical-price responses are synthetic.

The portable suite now covers:

- CLI reconciliation, process restart, provider failure/recovery, repeated slots
  and a wallet with no anchor;
- service decoding, evidence collection, exact reconciliation, private atomic
  persistence, checkpoint projection and concurrent-writer rejection;
- preservation of the last trusted receipt through active funds, program
  upgrades, corrupt state and missing historical prices;
- cumulative extension amounts, fees, ownership, claims, continuity and missing
  or duplicate transaction evidence;
- anchored daily earnings and scoped cumulative value, partial coverage,
  incomplete market quotes, chain reload, corrupt records, forks and slot gaps;
- funded custody accounting, pending-round/stored-SOL positions, legacy hash
  continuity and publication fallback;
- covered historical recovery, saved observations beyond the recent-view limit,
  offline older-week selection and preservation of live state;
- supported claim receipts and fees in v3 combined daily net, plus optional isolated
  principal/refining-fee attribution without changing net or acquisition basis.

Run the full portable engine suite from `engine/` with the pinned Node runtime:

```sh
npm test
```

The earlier captured-history tests are not copied or replayed. These purpose-built
scenarios cover the named portable journeys; they do not prove every historical
transaction shape, a real provider's completeness, or a community wallet's
opening cost basis. Reviewing and onboarding real anchors remains separate work.

`claim-evidence.mjs` generates legacy/v0 compiled GODL claim responses using the
pinned 12/14-account ABI and four-index Steel token transfer. Tests compare exact
raw token balances and transfers, exercise optional referrals and unavailable
routes, and prove the offline CLI leaves saved files unchanged. Its signatures
and execution metadata are synthetic, not authenticated chain evidence. This
receipt-only fixture does not itself establish principal attribution or
claim-spanning net accounting.

`claim-accounting.mjs` extends that receipt evidence with generated opening/closing
miner state and complete synthetic interval envelopes. It covers v3 counter
conservation, carry-in cancellation, referrals, multiple/same-second claims,
exact historical network fees and live/older-week projection in the claim suites.
`claim-attribution.mjs` adds isolated miner reward factors and the pinned charged
or exempt refining transition. Its suites cover exact principal/refined/fee
breakdowns, factor and integer bounds, unavailable evidence and optional metadata
fallback without changing earlier daily fields or ledger hashes. These fixtures
prove the named local calculations and rejection paths, not authentic mainnet
history or a wallet's historical acquisition basis.
