# Portable engine test fixtures

This directory intentionally contains no captured wallet, RPC, transaction, or
accounting history.

The source suite's captured-history cases were not ported:

- the accounting CLI reconcile/restart/failure journey;
- accounting service checkpoint refresh and projection journeys;
- earnings projection and checkpoint-chain loader journeys;
- ongoing accounting extension and checkpoint validation journeys.

Those cases depend on a reviewed real-period anchor and RPC snapshot. The
portable suite keeps small synthetic checks for CLI argument rejection,
upgradeable-program deployment decoding, and settled-state validation. Restoring
the omitted coverage requires purpose-built synthetic accounting checkpoints;
real captures must not be copied here.
