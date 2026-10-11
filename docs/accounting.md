# Accounting and coverage

GODL Monitor separates direct observations from accounting conclusions. A public chain balance can be observed immediately; acquisition cost and gain/loss cannot be inferred safely from that balance alone.

## What works without an accounting anchor

- unrefined, refined, and gold balances;
- current-price gross holding values when fresh quotes are available;
- balance-based and claimable-value goals;
- local history and reward notifications.

Gross holding values are current quantities multiplied by current market quotes. They are not proceeds, net profit, or a sale estimate after fees and slippage.

## What requires a verified anchor

Net cost, today's net value, and cumulative gain/loss require a separately reviewed, wallet-specific `accounting-anchor.json`. The anchor establishes a trusted starting boundary for reconciling finalized transactions and historical prices.

There is no automatic trusted-anchor bootstrap for a new wallet. The project deliberately does not create a zero-cost anchor, infer cost from current balances, or turn lifetime counters into a cost basis. Preparing and approving an anchor is an expert review task outside the general setup tutorial.

### Import an already-reviewed starting point

1. Open **Settings → Mining costs → Set up accounting**.
2. Choose your reviewed `accounting-anchor.json`. The check is local and makes no
   network requests. It checks the wallet, derived account identities, settled
   boundary and receipt arithmetic against the supported accounting format.
3. Review the active wallet, covered cost period, unrefined amount and recorded
   SOL/USD cost. Expand **Starting point & scope** for the opening-balance basis,
   price method and limitations.
4. Confirm that you have reviewed this wallet's starting balance and cost history,
   then choose **Import starting point**.

**File checks do not independently prove historical costs.** Do not import a
sample, another person's file, or a file whose opening basis has not been
reviewed. The importer cannot create that evidence for you. Without a reviewed
file, continue using balances, recorded rewards and goals.

The file must remain unchanged between review and import. The app refuses to
replace existing anchors, checkpoints or evidence, including corrupt or
unreadable entries. Imported state is private to the active wallet profile.
Saving another wallet in Settings does not switch the active profile until the
app is reopened.

Reconciliation starts after import and checks later finalized activity. Pending
rounds, unclaimed SOL, incomplete history, unsupported transactions or missing prices may leave
net figures unavailable. Importing a starting point does not restore earlier
daily history, transfer another Mac's observation journal or verify off-chain
costs. Existing users with accounting history keep their current files.

## Daily coverage

Daily rows compare the first and last verified terminal observations available within the named local calendar day. They may cover only part of that day. The displayed interval is the covered interval; it is not extrapolated to a 24-hour rate and does not imply midnight-to-midnight coverage.

If the observations or required prices are incomplete, the relevant value stays unavailable. The app does not replace missing values with zero.

## Cumulative scope

The cumulative projection is intentionally `unrefined-only`. It attributes reconciled spend to the verified unrefined GODL scope and excludes:

- refined GODL and gold;
- unknown opening holdings;
- off-chain costs;
- claim transaction fees;
- sale costs and slippage.

Historical holdings whose origin is outside the verified starting boundary remain unknown rather than being assigned a fabricated cost. Read the coverage note and verification timestamp alongside every net figure.

## Refresh behavior

- Balance observations: approximately every 15 seconds
- Accounting reconciliation: approximately every 5 minutes when an anchor exists
- Market quotes: refreshed at most every 5 minutes and considered expired after 10 minutes

Provider errors, rate limits, stale quotes, sleep, and network loss can delay those cycles. The last verified period may remain visible with its status instead of being silently replaced.

System wake requests fresh balances and, when an anchor exists, an accounting
check. A helper already in progress completes before one queued follow-up starts;
repeated wake events do not accumulate a backlog. Sleep suppresses new launches,
and quitting prevents late completion callbacks from restarting helpers.
Existing deadlines and normal retries still apply if the network has not recovered.

A repeated finalized slot leaves the last verified receipt intact until the
chain advances. It cannot create a second accounting checkpoint for the same
slot or count the same rewards and costs twice.

## Activity versus earnings

Activity shows the saved accrual journal and, in a separate view, changes in the observed unrefined balance. These are not added together. Accrual entries are gross increases before claim fees, bounded by the times they were observed; an overnight catch-up entry may span more than one day. The journal starts when tracking begins and does not reconstruct rewards from before its baseline. Claims and missing observations can leave gaps.

[CSV export](activity-export.md) preserves those recorded intervals and exact
native amounts. It does not add net earnings, historical USD valuations or
guessed daily totals, and it does not mark notifications as read.

Today’s net figure continues to use the accounting engine’s covered interval, after fees and mining spend. It is not the sum of the Activity rows. USD hover values use current, unexpired quotes rather than a historical sale value. Missing quotes or coverage remain unavailable. Balance decreases are not classified as losses or claims without evidence.


### Recorded today and missing values

Activity and Overview show **Recorded today**: saved increases whose entire
observation interval falls within today in the earnings timezone. The widget
shows this summary when today's verified net is unavailable. This is gross
reward value at current prices, before fees and costs, not a complete-day return
or a net-profit estimate. Overnight catch-up intervals remain in Activity but
are excluded from this daily sum; its note identifies that omission.

Empty history means no records, not zero earnings. An accrual-cell dash means no
increase was recorded for that asset in that interval; it does not establish a
zero balance or continuous coverage. Numeric zero in verified accounting keeps
its distinct meaning. Missing or expired quotes preserve native amounts, and a
combined USD value requires a quote for every asset included in that sum.

The verified-net status distinguishes awaiting settlement, absent history,
incomplete inputs, provider retries, review requirements and missing prices.
Pending deployments and unclaimed SOL now permit a verified **cash-cost** boundary,
while still preventing a new complete net result. The separate current position
shows exact cash spent less actual receipts, deployed stake with an unknown outcome,
and gross stored SOL before claim deductions. Matching round/checkpoint IDs settle
a retained deployment grid; a pending stake is never labeled a known loss.

Refundable automation deposits and refunds remain owner capital. Actual reserve
consumption, received SOL and fees affect cost at historical event SOL prices,
including spending without wallet movement. Stored SOL accrual is neither rent nor
cash already received; its later wallet or automation receipt is credited once.
The reviewed older cost prefix keeps its original basis.

The last settled net remains explicitly dated to its own coverage. A corrupt or
incomplete funded ledger preserves the frozen closed result and independent holdings.
The version-2 sidecar preserves version-1 anchors, ledger hashes and history; it does
not predict round rewards, choose a claim route or create a fiat acquisition basis.
The separate historical recovery below only uses covered saved observations.
See the [pending/SOL contract](plans/pending-sol-accounting.md),
[earlier funded accounting brief](plans/active-mining-accounting.md) and
[consolidated backlog](roadmap.md#deferred-product-and-review-backlog).


## Recorded daily history

Overview and daily details show the saved reward journal by calendar day, including
older weeks. These are observed positive increases before fees and costs, valued
at current prices when quotes are fresh. They remain available while net accounting
waits for settlement. Empty days are unknown, and intervals spanning midnight stay
in Activity without being allocated to an invented day.

The last verified mining result visibly identifies its start and end dates. It
values only checkpoint-attributed unrefined principal at current prices; it is not
current whole-wallet profit. See [correction evidence](history-correction.md).

## Recovering covered daily net

The seven-day verified-net table can recover actual first/last settled observations
inside an already committed reconciliation interval. Complete saved transaction
and price evidence must reproduce the parent-to-child costs, fees, rent and
signature sets. Both sides of every recovered boundary must also reconcile under
that interval's original closed or funded cost method. This does not reprice old
costs under a newer method or replace the reviewed starting boundary.

Recovered days remain partial: the displayed hours are actual observations, not
invented midnight boundaries. Reward USD uses current fresh quotes; historical
cash costs use the original event prices. Expired quotes retain native amounts
and verified cost. Pending stake, stored SOL, claim changes, missing observations
and incomplete evidence cannot supply a complete net boundary.

Recovery reads the full local observation store, including data older than the
recent balance-view limit. It changes only daily projection: cumulative totals,
current position, journals, checkpoints and immutable evidence stay unchanged.
Initial balances publish before optional recovery. Unsupported recovery leaves
the existing verified rows available. Older-week net navigation and pre-anchor
or pre-monitor reconstruction remain outside this slice. See the
[contract and verification](plans/historical-accounting.md).
