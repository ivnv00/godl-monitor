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
