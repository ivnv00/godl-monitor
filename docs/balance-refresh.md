# Balance refresh correction

Scope: remove avoidable latency between a finalized observation and its display
in the window and menu-bar widget. Preserve exact amounts, wallet isolation,
accounting coverage and the original timestamp of repeated finalized slots.

## Delivery contract

- Fetch accounts and network identity concurrently; require both before accepting
  an observation. Timestamp the account response, not a later network check.
- Start optional quote fetching alongside observation. Publish the current view
  with validated cached quotes while a provider is slow, then publish fresh
  valuations for the same observation when available. Invalid accounting history
  must leave independent holdings and quote data usable; net remains unavailable.
- The app passes `--notify`. Every completed atomic file replacement emits a fixed
  `view-ready` line on stdout. Markers contain no financial or personal data. The
  app reloads the validated file on a marker and at successful helper exit.
- Parse and prepare history outside the main UI actor. A newer load supersedes
  older work; helper completion waits for the final load before launching a queued
  refresh. Shutdown and timeout invalidate pending loads.
- Poll every 15 seconds using common run-loop modes. Explicit requests and
  accounting completion during active observation queue one follow-up; periodic
  ticks skip busy work. Sleep/wake and stop retain their existing serialization.

## Proof and rollback

Use synthetic deferred network responses to exercise early publication, later
valuation, wrong network, provider failure and corrupt accounting history. Native
lifecycle tests cover coalescing, periodic ticks, sleep and shutdown. A synthetic
10,000-point history measures parsing/preparation without personal observations.
An isolated native harness exercises the production controller, helper callbacks,
window and compact widget. Run the complete repository preflight before packaging.

No persisted schema or accounting evidence migration is required. Retain the
previous installed app for local rollback; stop the current copy before replacing
it. Existing profiles and observations remain outside both app bundles. Public
distribution remains subject to the release gates in [Releasing](releasing.md).

Finalized-chain settlement, RPC availability and the five-minute accounting
reconciliation cadence still bound what can truthfully be displayed. Faster
display does not create unobserved rewards or make gross amounts verified net.

## Local evidence — 7 October 2026

- Full preflight: 127 Swift, 137 engine and 57 Python tests pass, including the
  privacy boundary and 103 local documentation links. Native release compilation
  passes with warnings as errors. One independent integration review found no
  actionable regressions in the changed refresh path.
- A synthetic 10,000-point history took 1.209 seconds to prepare with the old
  date parser and 0.014 seconds with the replacement on this Apple silicon Mac;
  file decoding/validation measured 0.021–0.032 seconds. History preparation now
  also runs outside the main actor. These are local measurements, not a network
  latency guarantee.
- An isolated native app using the production controller and gated synthetic
  helpers verified publication before helper exit, final enrichment before the
  queued next observation, coalesced requests, failure preservation/recovery,
  sleep/wake serialization and shutdown. No personal profile or live RPC was
  used in that harness. Physical sleep and other supported Macs remain separate
  release checks.

After installing 0.2.18 build 20, five live observations showed successive
intervals of 14.94–15.01 seconds; publication followed account observation by
0.30–0.90 seconds in that sample. Full window and widget showed matching unrefined,
refined and gold balances with the app observing normally. Saved configuration,
goals, accounting anchor and observation history were preserved. These latency
measurements contain no wallet addresses or financial amounts.
