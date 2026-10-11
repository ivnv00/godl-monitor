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
  incomplete market quotes, chain reload, corrupt records, forks and slot gaps.

Run the accounting journeys from `engine/`:

```sh
node --test accounting-cli.test.mjs accounting-service.test.mjs earnings.test.mjs ongoing-cost.test.mjs
```

The earlier captured-history tests are not copied or replayed. These purpose-built
scenarios cover the named portable journeys; they do not prove every historical
transaction shape, a real provider's completeness, or a community wallet's
opening cost basis. Reviewing and onboarding real anchors remains separate work.

`claim-evidence.mjs` generates legacy/v0 compiled GODL claim responses using the
pinned 12/14-account ABI and four-index Steel token transfer. Tests compare exact
raw token balances and transfers, exercise optional referrals and unavailable
routes, and prove the offline CLI leaves saved files unchanged. Its signatures
and execution metadata are synthetic, not authenticated chain evidence; this
does not establish principal attribution or claim-spanning net accounting.
