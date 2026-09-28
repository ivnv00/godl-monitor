# Goals and activity transfer

## Closed slice

Add a private JSON backup of the active wallet's goals and recorded accrual inbox,
then restore it into a wallet profile that does not exist on the destination Mac.
Keep the existing native Warm Ledger design and standard file dialogs. No merge,
replacement, sync, accounting migration, wallet transaction or cloud service.

## Contract

- A versioned, typed document contains the public wallet, creation date, goals,
  recorded gross accruals and their read states. Goals retain IDs, order, styles,
  pins and archived state. Exact units and observation intervals are unchanged.
- Explicitly exclude RPC configuration, cached prices, observation SQLite files,
  accounting evidence, helper state, machine paths and macOS preferences. The
  backup is unencrypted personal data; disclose this before saving/restoring.
- Validate size, version, dates, amounts, duplicate IDs, chronological intervals
  and wallet/Mainnet/program identities. Unknown versions and invalid input fail
  closed with fixed messages. Re-encode typed data; never extract arbitrary paths.
- Snapshot on the main actor, prepare/parse off it. Review and restore use the
  same immutable bytes in memory; later file replacement cannot change the import.
- Restore creates two fixed files in a private staging directory, then atomically
  publishes the new wallet directory with exclusive rename. Existing directories,
  files, symlinks, active/legacy profiles and unsupported settings are protected.
  Failure before publish removes only our staging directory. Once published, the
  profile is complete and retained; wallet activation remains a separate normal
  setup action. Cancellation before confirmation performs no profile writes.
- Detection cursor is deliberately reset. First fresh observation establishes a
  new baseline without replaying restored alerts or inventing transfer-gap income.
  Imported unread entries stay unread. Net accounting stays unavailable until
  separately configured; the backup is not proof of historical earnings.

## UI and ordering

Settings: Goals & activity / Save backup. First run and Wallet settings: Restore
backup. Choose file, inspect wallet/date/counts/scope, explicitly Restore, then
populate the wallet field for Start monitoring / Save wallet. Existing profile
conflicts explain that nothing was replaced. Restoring never switches the active
monitor behind the user's back.

## Proof / rollback

Tests: exact round trip and restart; private permissions; cursor reset/no replay;
corrupt/newer/oversized/wrong-wallet/wrong-network/invalid amounts/duplicates and
cross-day intervals; destination collision, symlink, cancellation and staging
failure leave existing bytes intact. Native synthetic save/review/cancel/restore
and conflict journey, minimum window and widget. Full repository gates and
source/history/package privacy at delivery. Removal of the feature needs no
migration: restored files already use existing stores. Do not remove user data.
