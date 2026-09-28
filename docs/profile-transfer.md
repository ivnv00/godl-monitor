# Move goals and activity to another Mac

This transfer preserves a wallet's **goals and recorded reward history**. It is a
private, unencrypted JSON file containing the public wallet address, goal titles,
reward amounts, observation times and notification read states. Keep it private;
do not attach it to a bug report or commit it to a repository.

## Save on the old Mac

1. Open **Settings → Goals & activity → Save backup**.
2. Review the wallet, goal count, recorded intervals and saved date.
3. Choose **Save backup** and a private location in the standard save dialog.
4. Transfer the file using a method you trust, such as AirDrop to your own Mac.

The file captures the active wallet at the time you open the backup sheet.
Monitoring can continue afterwards; later rewards need a new backup. A pending
wallet change does not change the active wallet being backed up. The file is
created with owner-only permissions, but copying or sharing it may change those
permissions. File permissions are not encryption.

## Restore on the new Mac

1. Install the app, then choose **Restore backup** before adding the wallet.
   The menu-bar setup links to the full overview window for this step.
2. Choose the JSON file and inspect its wallet, saved date and counts.
3. Choose **Restore**. Only the reviewed snapshot is restored, even if the
   selected file changes afterwards.
4. Choose **Done**, then **Start monitoring** with the prefilled wallet address.
5. Re-enter an optional private RPC URL on this Mac and choose its notification
   and launch-at-login preferences separately.

If another wallet is already active, **Settings → Wallet → Restore backup**
restores the new wallet's profile. Choose **Save wallet**, then quit and reopen
to switch. Restoring itself does not switch or stop the active monitor.

An existing profile for the same wallet is never merged or replaced—even if it
looks empty. Keep existing files in place; use a new Mac/user profile for this
transfer. Unsupported settings, corrupt backups and unsupported backup versions
are preserved. Cancel before Restore to leave local profiles unchanged.

## What transfers

| Included | Excluded |
| --- | --- |
| All saved goal metrics, targets, order, styles, pins and archived state | RPC URLs and provider keys |
| Exact recorded accrual amounts and original intervals, including catch-up across days | Observation databases and balance charts |
| Read/unread states for those records | Cached prices and current balances |
| Wallet identity for correct profile placement | Accounting anchors, cost evidence, checkpoints and verified net history |
| Backup creation date | macOS notification/login preferences and helper state |

Recorded increases are gross observations, not verified profit. The restored
history is not independently rechecked against the chain. The first fresh
observation establishes a new detection baseline without replaying old reward
alerts; earnings during the transfer gap are not inferred. Fresh balances and
prices load normally. Net accounting requires its separate
[reviewed starting point](accounting.md#import-an-already-reviewed-starting-point).

This is not a complete disaster-recovery backup of Application Support. Keep the
old Mac's private data if you need the excluded observation/accounting history.
Files over 32 MB, more than 100,000 recorded intervals or more than 1,000 goals
are rejected rather than partially restored. Activity's [CSV export](activity-export.md)
remains the spreadsheet format and cannot be restored.

Use matching/current app versions for transfer. If a future decoder changes its
source identity, older records remain stored but may be hidden by Activity’s
current-source filter. Cross-decoder history presentation remains a known limit.
