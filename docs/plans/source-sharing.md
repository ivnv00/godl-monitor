# Source-sharing preparation — 18 October 2026

## Decision and scope

Prepare GODL Monitor for sharing as a source-build alpha that people can build,
install and contribute to. The owner chose not to use Developer ID signing or
Apple notarization and confirmed permission to include the existing GODL artwork
in shared source. The artwork stays outside the MIT source grant.

The starting repository revision is `d7078078968ffde143041f950d8e9a93baebb81b`.
The installed app remains 0.2.39/build 42 from `2bfd15f`; this task does not launch
or replace it, alter personal settings or migrate financial evidence.

## Invariants and completion contract

- Preserve read-only operation, exact amounts, unknown coverage and isolated
  profiles. Use synthetic fixtures only. No new product features or redesign.
- Keep private keys, endpoints, wallet identifiers, personal paths and real
  history out of source, reachable history, screenshots and generic packages.
- Verify the documented source-build path, complete local checks, dependency
  audit, Git-history privacy, image review and independent Daybreak Blue review.
- Resolve confirmed security/data-loss/core-journey blockers. Record nonblocking
  findings in the roadmap with an explicit disposition.
- Describe tested platforms and unverified behavior accurately. Source sharing
  does not claim a notarized download, Intel hardware certification, minimum-OS
  coverage, automatic accounting reconstruction or whole-wallet profit.
- Leave a clean committed repository. Keep visibility private and publish no
  binary, release, Pages or announcement without final owner approval.

## Ordering and rollback

Review the existing state and history; update installation, contributor and
rights guidance; review security; correct in-scope blockers; run required gates;
commit the source candidate; build and inspect it from a fresh clone; record the
exact evidence. Documentation/package-guide rollback is an ordinary Git revert.
No installed-app rollback or data restore is needed because neither is changed.

## Verification record

Daybreak's first pass found two P1 runtime issues and one P2 scanner limitation.
The P1 corrections and focused recheck are in progress; the checks below record
the initial source candidate, not a final readiness verdict. Private logs and
scan inputs stay outside the repo.

### Review dispositions

| Finding | Severity | Disposition | Required proof |
| --- | --- | --- | --- |
| Engine accepts HTTP and follows RPC redirects despite the native HTTPS boundary | P1 | `blocking-in-scope` | Reject insecure configuration; deny redirects in observation, deployment, history and accounting/retry paths; normal HTTPS still works |
| Network bodies can be buffered and saved without a streaming ingress cap | P1 | `blocking-in-scope` | Bounded decoded-byte reads before parsing/capture; cancel oversized responses; save no rejected body; preserve prior valid cache/checkpoint and historical originals |
| Scanner misses unquoted accounts, some text suffixes and non-macOS path forms | P2 | `deferred` | Manual review closed the gaps for current content; future scanner work is recorded in the roadmap |

The network correction uses one shared HTTPS/redirect/response boundary, with
small response limits for genesis/deployment/block time, larger limits for
observations, and bounded transaction/history and quote/candle bodies. No test
HTTP exception is exposed by the production configuration. Synthetic tests
inject HTTPS responses. Existing financial evidence and file-format limits are
preserved; no automatic deletion or migration is added.

### Initial candidate checks

- Local preflight: **865 passing tests** (206 Swift, 592 engine, 67 Python), with
  Swift warnings treated as errors. After the installer-guide changes, all 24
  distribution and 13 package checks passed again; 279 local documentation links
  resolved at that checkpoint.
- `npm ci --ignore-scripts` and `npm audit --omit=dev`: nine installed dependencies,
  zero known advisories returned. This is not a proof against unknown supply-chain
  compromise.
- Source/index/reachable-history scan passed. The post-build scan covered **82
  commits and 925 file versions**, including deleted historical content and
  commit/tag metadata. Eight known local private identifiers were compared only
  in memory, including wallet-derived accounts and endpoint/key values; no match
  was found in source, index, reachable history or the universal ZIP.
- Reviewed all seven unique current/historical app screenshots: synthetic banners,
  fictional values and empty setup input; no private identifiers observed.
  Across history there are 12 distinct image blobs including brand assets. App
  image metadata contains dimensions, resolution and color information only.
- Git attribution uses the project contributor name and the repository owner's
  GitHub no-reply address. The repository account remains intentionally visible
  in repository URLs and attribution; no-reply does not provide anonymity.
- GitHub readback: private repository, one branch, no tags, issues/PRs, releases
  or uploaded Actions artifacts; wiki and Pages disabled. Private Vulnerability
  Reporting was unavailable (404) while private, so it must be verified after
  approved publication. No repository settings were changed.

### Clean-clone package proof

A fresh full clone of **`e3e2c28a74eb72dc94bd37f4cf277dedb6503a96`** built the
README's universal ZIP and DMG. Both app and Node contain `arm64` and `x86_64`.
Release compilation passed with warnings as errors using Xcode 27.0 (27A266a),
Swift 6.4 and macOS SDK 27.0 (26A425), on Apple silicon/macOS 27.2. The bundled
Node/SQLite/engine smoke checks and strict ad-hoc signature verification passed.

The DMG was mounted read-only and detached after inspection. Its **367 app files
and file modes match the ZIP**, and the Applications shortcut and updated setup
text are correct. Both SHA-256 sidecars matched. This did not install or launch
the app or exercise native Intel hardware.

| Local verification artifact | SHA-256 |
| --- | --- |
| 0.2.39 universal ZIP from `e3e2c28` | `0895a08fbce70e3f17b35043877efd976e86518d8511bf59f74e0795697b9ee4` |
| 0.2.39 universal DMG from `e3e2c28` | `801269ef536aae80fcf474e334cc00ddd97dd090edb5589cf29b7ff9f151e92f` |

These are private build-verification artifacts, not published downloads. The
installed 0.2.39 app retains its earlier, separately documented source revision.
Any later documentation-only commits do not change the tested runtime inputs.

## Final publication steps

The owner's final approval must name the source revision and sharing destination.
Only after public visibility is explicitly approved: enable and verify GitHub
Private Vulnerability Reporting, execute the public-only CI jobs and configure
merge protection from their actual check names. Do not count private-job skips
as tests. See [Releasing](../releasing.md) and
[Contribution checks](../contribution-checks.md).
