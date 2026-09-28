# First-run review

The local 0.2.13 candidate completed the following isolated first-run checks on
2026-09-28. No blocking onboarding defect was found in these journeys. This is
local preparation evidence; the clean-machine and signing gates in
[Releasing](releasing.md) remain open.

## Candidate and test boundary

- Version: 0.2.13, build 15.
- Packaged application source: `ef62a4a015d1cd8400b1a4f2195c2165a5f3d7d9`.
- Reviewed source: `726d286afe3862d4381d7cb03e3bf84bc604298e`; intervening
  changes affect documentation and CI, not application code.
- ZIP: `GODL-Monitor-0.2.13-universal.zip`.
- ZIP SHA-256:
  `f5d7a52f89bd67cdc7fba4568818c95b10343f30e1a685685745cb876dcffb15`.
- Host: Apple silicon, macOS 27.0, with developer tools installed.

The extracted candidate passed strict signature verification. A copy used a
distinct test bundle identity and a new ad-hoc signature to avoid selecting an
already-running monitor. The application executable, bundled runtime, engine
and resources otherwise came from the ZIP. Each scenario used a temporary
home, including Foundation's application-support directory, and a system-only
`PATH`. Public fixture addresses without a GODL miner account and the default
public Mainnet provider were used; no private wallet or API key was required.

This establishes the flows below using the packaged runtime. It does not prove
installation on a Mac without developer tools, native Intel execution, macOS 14
compatibility, Gatekeeper acceptance, or the production bundle identity's
notification and login-item behavior. No notification permission or login-item
registration was requested.

## Observed results

| Journey | Result |
| --- | --- |
| Empty first run | Start monitoring remained disabled until input was present. Diagnostics was reachable before setup. |
| Invalid public address | Validation rejected the input, retained focus, and created no saved wallet or profile. |
| Valid fixture address | The full window opened immediately; Settings stayed reachable during refresh. A finalized observation completed through the bundled runtime and public RPC. |
| No miner or accounting anchor | Unavailable balances and net history stayed explicitly unavailable; no earnings or starting values were invented. |
| Empty or HTTP provider | Empty submission was disabled; HTTP was rejected before saving. |
| Successful provider check | The public HTTPS Mainnet endpoint was checked and saved; the secure field cleared. Wallet and provider settings had owner-only `0600` permissions. |
| Failed provider check | An unreachable HTTPS endpoint showed fixed recovery guidance, retained the typed value, and left the previous saved provider unchanged. |
| Wallet switch and relaunch | Saving another fixture address deferred the switch until relaunch. A separate profile was then created; every file in the previous wallet profile retained its checksum. |
| Compact first run | The empty setup fitted the 360×600 menu-bar panel without clipped controls. |
| Compact configured view | The overview showed the finalized update and appropriate unavailable states; navigation remained reachable. |
| Diagnostics before setup | The sheet reported app/runtime/configuration status without a wallet, endpoint, local path or balance. |
| Unsupported settings | A future-version fixture remained byte-for-byte unchanged after an attempted save; no replacement wallet profile was created. |

All test copies were stopped after verification. These checks required no
application-code change or candidate rebuild.

The repository preflight, `python3 scripts/check.py`, also passed: 107 Swift,
131 engine and 57 packaging/privacy-script tests, the source privacy scan and
documentation link checks. These local results do not substitute for hosted CI
or the untested platform and distribution boundaries above.

## Deferred finding

**P2 — unsupported-settings recovery copy:** the initial screen correctly says
existing files were preserved, but attempting to save a new wallet then reports
a generic permissions error. The underlying cause is an unsupported settings
version. Preservation works; improve the later message to identify that cause
and explain recovery without encouraging deletion of existing data.

This finding is deferred, not a blocker for the verified first-run paths. The
[roadmap](roadmap.md) tracks it alongside the remaining hardware, OS, accounting
and distribution work.
