# Early balance publication

Owner-promoted slice, 11 October 2026. Publish validated balances and available
cached-price holdings before reading optional closed or funded accounting chains.

## Contract

- The first atomic view uses the accepted finalized observation. Its balances,
  recorded rewards, provenance and timestamps are identical to later enrichment.
- Historical net stays unavailable until the existing chain validation succeeds.
  An optional `earningsHistoryPending` boolean marks the interim holdings-only
  publication; final and legacy views omit it. It changes no stored evidence schema.
- The native historical chart may retain its separately dated, previously verified
  view during that interim stage for the same wallet/network/program/source and
  time zone. It must not merge old holdings into the current balance view or reset
  an older-week selection merely because the interim earnings schema is older.
- Accounting failure retains independent balances/holdings and existing fallback
  rules. Failed or timed-out helpers retain already accepted balances. All writes
  and notifications stay serialized; stale loads must not replace newer data.
- Existing observations, receipts, checkpoints, reward read states and settings
  remain untouched. No new network endpoint, wallet action or migration is added.

## Proof and delivery

Use held closed/funded loaders to prove publication before either completes;
check rejection, missing evidence, quote enrichment, exact final-result parity,
identity/timestamp preservation and no input mutation. Exercise native history
selection across interim/final publications, identity changes and failure.
Run the production-controller harness for early acceptance, final enrichment,
queued refresh and timeout, then repository preflight and package privacy checks.

Retain the previous app and a consistent private SQLite/state backup before the
local update. Verify every prior observation and reward entry survives, check
window/widget and resumed monitoring. Rollback replaces only the app binary;
never overwrite newer history with the backup. Developer ID/notarization remain
on hold; private CI remains skipped.

## Source verification

The initial held-loader test failed before the change: zero publications existed
when the closed-history loader was entered. It passes after reordering, as does a
held funded loader with both successful and rejected completion. Native older-week
retention also failed before its change and passes afterward.

The complete local preflight passes **722 tests: 197 Swift, 458 engine, 67 Python**.
The new cases cover unknown quotes, failed writes, unchanged observation identity,
input immutability, legacy/invalid pending metadata, final unavailable history,
source/timezone isolation, clock rollover and in-flight historical requests.
Pending metadata does not bypass holdings or net arithmetic validation. Existing
funded, pending-SOL, historical-recovery and CLI preservation tests still pass.

The checked-in native regressions target the history controller in GODLCore;
production-helper callback orchestration remains covered by an isolated local
harness, not a new persistent native-app test target.


One independent review found no actionable regressions. Its 28-case comparison
against the prior publisher produced identical complete final views across
closed/funded/missing/rejected evidence and absent/cached/refreshed quotes.

The isolated production-controller harness passed early acceptance while held,
older-week retention, final enrichment before a coalesced follow-up, the actual
35-second timeout with retention/recovery, exactly-once reward recording,
concurrent 10,000-point startup cache/live publication ordering and ignored late
writes after stop. The synthetic Overview was visually inspected. This proves
local callback behavior, not physical sleep or operation on other Macs.
