# Image provenance

Refreshed on 2026-09-28 for the 0.2.7 packaging candidate. These are native
SwiftUI views from the production UI at source revision `37f0a77`, rendered in
an isolated documentation harness. These are historical previews, not a claim
of pixel parity with the latest app. Version 0.2.17 simplified the widget's
recorded-rewards card; see [current status](../current-status.md).
The harness uses generated fixtures, no live RPC, and a separate synthetic
identity. It exports the content view directly; no desktop or personal windows
are captured. The synthetic-data banner is part of each application image.

| Image | View |
| --- | --- |
| `widget-roadmap.png` | 28 September 360×600 widget with recorded rewards, pending verified net, balances and a roadmap |
| `overview.png` | Overview with recorded rewards, daily bars and scoped gain/loss |
| `activity.png` | Accrual ledger, catch-up interval and tiny-amount presentation |
| `goal-styles.png` | Roadmap, Ring and Bar using the shared goal component |
| `setup.png` | Public-address first-run screen, with an empty input |

All balances, prices, activity, goals and history are fictional demonstration
data. No captured wallet data is used. Future refreshes must retain this boundary
and be visually checked against the current native components.

The wordmark is unchanged GODL Supply artwork; see [brand sources](../../Brand/SOURCES.json)
and [NOTICE](../../NOTICE) for its provenance and separate rights boundary.
