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
Both P1 corrections are implemented in **0.2.40/build 43**, source commit
**`1766d0f66cd069ec4f34c1b273b00f5c676a0d8c`**. Daybreak Blue’s focused
independent recheck closed both findings and found
no correction-caused P0/P1 regression. The source-build candidate is ready for
the owner’s sharing decision, subject to the platform and publication boundaries
below. Private logs and scan inputs stay outside the repo.

### Review dispositions

| Finding | Severity | Disposition | Required proof |
| --- | --- | --- | --- |
| Engine accepts HTTP and follows RPC redirects despite the native HTTPS boundary | P1 | `blocking-in-scope` — fixed and rechecked | Reject insecure configuration; deny redirects in observation, deployment, history and accounting/retry paths; normal HTTPS still works |
| Network bodies can be buffered and saved without a streaming ingress cap | P1 | `blocking-in-scope` — fixed and rechecked | Bounded decoded-byte reads before parsing/capture; cancel oversized responses; save no rejected body; preserve prior valid cache/checkpoint and historical originals |
| Scanner misses unquoted accounts, some text suffixes and non-macOS path forms | P2 | `deferred` | Manual review closed the gaps for current content; future scanner work is recorded in the roadmap |

The network correction uses one shared HTTPS/redirect/response boundary, with
small response limits for genesis/deployment/block time, larger limits for
observations, and bounded transaction/history and quote/candle bodies. No test
HTTP exception is exposed by the production configuration. Synthetic tests
inject HTTPS responses. Existing financial evidence and file-format limits are
preserved; no automatic deletion or migration is added.

### Candidate checks

Daybreak Blue (`gpt-daybreak-blue-latest`) completed one broad defensive
review and one focused correction recheck. Its direct recheck passed 67 tests;
83 could not execute in its read-only sandbox because temporary-directory or
loopback-listening operations returned `EPERM`. That invocation is **not**
counted as a full suite pass. The reviewer inspected the completed main-agent
preflight and real HTTPS probe to verify those affected journeys. The full
suite also passed independently from a fresh clone of the committed candidate.
No live RPC or private profile was used for these runtime tests.

- Main-checkout and fresh-clone preflight both passed **895 tests** (206 Swift,
  622 engine, 67 Python), with Swift warnings treated as errors. All 282 local
  documentation links resolved at the candidate checkpoint.
- Regression tests first reproduced the HTTPS/redirect and oversized-body
  failures. They now cover exact/over-limit streams, cancellation, retries,
  rejected-body exclusion and preservation/recovery of prior views, caches and
  checkpoints. A separate real HTTPS probe used a locally trusted synthetic
  certificate without disabling TLS checks: 307/308 POSTs never reached the
  redirect target; exact-size bodies passed; chunked, decoded-gzip and declared
  oversized bodies were rejected. The temporary certificate and key were removed.
- `npm ci --ignore-scripts` and `npm audit --omit=dev`: nine installed dependencies,
  zero known advisories returned. This is not a proof against unknown supply-chain
  compromise.
- Source/index/reachable-history scan passed. The post-build scan covered **83
  commits and 959 file versions at the runtime candidate**, including historical
  content and commit/tag metadata. Eight known local private identifiers were compared only
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

A fresh full clone of **`1766d0f66cd069ec4f34c1b273b00f5c676a0d8c`** built the
README's universal ZIP and DMG. Both app and Node contain `arm64` and `x86_64`.
Release compilation passed with warnings as errors using Xcode 27.0 (27A266a),
Swift 6.4 and macOS SDK 27.0 (26A425), on Apple silicon/macOS 27.2. The bundled
Node/SQLite/engine smoke checks and strict ad-hoc signature verification passed.

The DMG was mounted read-only and detached after inspection. Its **368 app files
and file modes match the ZIP**, and the Applications shortcut and updated setup
text are correct. Both SHA-256 sidecars matched. This did not install or launch
the app or exercise native Intel hardware. The packaged network boundary, Node,
SQLite and chain imports passed smoke checks; test injection and test files are
excluded from the app. Source, index, history and ZIP passed another in-memory
known-private-value comparison.

| Local verification artifact | SHA-256 |
| --- | --- |
| 0.2.40 universal ZIP from `1766d0f` | `8d28b9b54d4d551d15a4217888a3daa9a55b0af6da803edc367c92c292f5dec8` |
| 0.2.40 universal DMG from `1766d0f` | `c0ed97bd0b6aa12640e9149a9e6a6350c98dbe1b15b7344437260874bbe27a8d` |

These are private build-verification artifacts, not published downloads. The
installed 0.2.39 app retains its earlier, separately documented source revision.
The final evidence-only documentation commit does not change the tested runtime
inputs. Obsolete intermediate packages and extracted app bundles were removed;
only the final private candidate packages and verification evidence are retained.

## Final publication steps

**Completed authorization:** the owner approved public source sharing at `0e0a0ae`
on 18 October 2026, without a binary release. The [publication record](public-source-launch.md)
contains the subsequent controls and hosted-check evidence. The checklist below
records the preparation requirements at the time this candidate was presented.

The owner's final approval must name the source revision and sharing destination.
Only after public visibility is explicitly approved: enable and verify GitHub
Private Vulnerability Reporting, execute the public-only CI jobs and configure
merge protection from their actual check names. Do not count private-job skips
as tests. See [Releasing](../releasing.md) and
[Contribution checks](../contribution-checks.md).
