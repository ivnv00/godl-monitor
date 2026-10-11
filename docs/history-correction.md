# Recorded history and number correction

## Closed scope

The 0.2.19 local-alpha slice addresses an Overview that showed “No history”
while saved reward intervals existed. The chart previously used only settled
accounting checkpoints; active mining can legitimately prevent a new checkpoint.
A missing covered-net interval must not hide independently recorded gross rewards.

## Invariants and implementation

- Project daily history from the existing reward inbox, with exact integer token
  sums and checked Decimal valuation. Never derive earned rewards from arbitrary
  balance movements or fill missing days/assets with zero.
- Permit older seven-day windows and preserve all saved interval/read-state bytes.
  Cross-day and future intervals are excluded from daily attribution; their
  original evidence stays in Activity.
- Do not coalesce a midnight-spanning interval with subsequent same-day rewards.
  Group with the accounting calendar, including fractional-offset timezones.
  Already-coalesced history cannot be truthfully split without further evidence.
- Keep verified net under its settled reward/cost rules. Show the latest accounting
  state only for today; an older uncovered day is not promised later reconstruction.
- Show both endpoints of the last verified unrefined mining period and identify
  current-price valuation. Current holdings and historical costs are different scopes.
- Preserve unreadable/unsupported settings, improve their recovery message, and
  announce login-item failures. Wrong-genesis accounting failures use the existing
  Mainnet recovery message without relaxing any other identity check.

No persisted schema migration, journal rewrite, signing credential, Apple upload
or transaction capability is introduced. Generic packages contain synthetic assets
and source only. Developer ID signing/notarization remain on the owner's hold.

## Verification boundary

Focused tests cover independent recorded history with missing net coverage,
older windows, unknown days, future/cross-day exclusions, expired prices,
midnight grouping in UTC/Sofia/Kathmandu, and historical-day status. Existing tests
retain exact math, overflow, duplicate/mixed-wallet rejection, DST, failed saves,
profile isolation and unknown values. The midnight and historical-status tests
were observed failing before their corrections and passing afterwards.

An independent numeric review identified the midnight coalescing undercount; the
integration review identified historical rows receiving today's accounting status.
Both were corrected within this slice. Live read-only arithmetic checks compare
published balances/holdings valuations with the same saved finalized observation;
these checks do not certify the original accounting anchor or transaction completeness.

The final preflight, synthetic full-window/widget checks, local package provenance,
privacy results and upgrade outcome are recorded in [current status](current-status.md).
Actual VoiceOver delivery, physical Intel/minimum-macOS operation, clean-Mac
installation and Developer ID/notarization remain separate validation boundaries.

## Rollback

Retain the preceding installed app and a consistent private state/database snapshot
outside the repository before replacement. Quit the app before swapping bundles;
leave profile and evidence directories in place. The prior binary can reopen the
same schema. Do not delete or rewrite old reward entries to improve chart appearance.
