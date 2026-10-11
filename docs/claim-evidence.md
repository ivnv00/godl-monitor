# Inspecting saved GODL claims

The offline inspector extracts a supported GODL claim receipt from an existing
saved RPC record. It reports exact owner/referral GODL transfers and the owner's
SOL network fee separately. It cannot execute a claim, connect a wallet or
change the app's history. The native dashboard does not consume this inspector
report; accounting collects and validates its own claim evidence.

From the repository, with its pinned Node runtime and installed dependencies:

```sh
node engine/claim-evidence-cli.mjs --wallet "$PUBLIC_WALLET" --record "$SAVED_RPC_RECORD"
```

`PUBLIC_WALLET` is the owner public key; `SAVED_RPC_RECORD` is one private JSON
record saved by accounting evidence collection for a `getTransaction` request,
not a reconciliation report or a raw transaction alone. The command reads that
file and prints JSON to stdout. It does not search profiles, contact an RPC
provider, rewrite permissions or write a report. Keep input and any redirected
output outside the repository and release packages.

The local app also bundles this generic helper and Node, so the same inspection
can run without a separate developer runtime:

```sh
"$APP/Contents/Helpers/node" "$APP/Contents/Resources/engine/claim-evidence-cli.mjs" \
  --wallet "$PUBLIC_WALLET" --record "$SAVED_RPC_RECORD"
```

Set `APP` to your installed GODL Monitor app path. No private key is used.

## What the report establishes

For the supported route, the raw token balances and compiled inner transfers
agree on the exact recipient, mint, 11-decimal GODL amount and treasury debit.
Network fee is the owner's proven lamport charge in the supplied response.
New-account rent is zero only because this route requires existing accounts,
no creation instructions and no non-owner lamport movement.

An optional referral receipt is separate from the owner's receipt. The report
does not recover the referrer's authority from transaction data alone. Original
mined principal and the refining deduction remain unavailable: received tokens
can combine amounts with different accounting meanings.

The inspector checks the saved raw digest, request/response identity and the
pinned decoder's route. A local checksum does not authenticate an RPC provider or
prove that the supplied response came from mainnet. Requested `finalized`
commitment is not independent finality proof. Those limits are explicit in the
JSON even when its receipt projection is observed.

## Unsupported evidence

Failed, sponsored, inner, multiple or mixed claims; missing token metadata;
unmatched transfers; account creation/rent top-ups; and unrecognized instruction
routes cannot supply a receipt. An unsupported response reports unavailable;
malformed records or invalid arguments exit unsuccessfully with a generic error.
Neither case turns missing amounts into zero or changes any saved input.

This is the receipt foundation for claim-spanning accounting. The collector uses
the projector inside complete committed intervals to continue supported combined
daily net. A separate derived [claim breakdown](plans/claimed-principal.md) can
use isolated miner observations and reward factors to establish principal and
refining fees; this receipt-only report remains unchanged. No prior anchor,
ledger hash, journal entry or cost basis is reinterpreted. See the
[accounting limits](accounting.md) and the
[source contract and verification](plans/claim-evidence.md).
