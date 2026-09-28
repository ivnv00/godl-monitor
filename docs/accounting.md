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

Place a reviewed anchor only in the matching wallet profile. The app validates its wallet and evidence chain before extending it. A missing anchor leaves accounting-only values unavailable while the rest of the monitor continues to work.

## Daily coverage

Daily rows compare the first and last verified closed observations available within the named local calendar day. They may cover only part of that day. The displayed interval is the covered interval; it is not extrapolated to a 24-hour rate and does not imply midnight-to-midnight coverage.

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

- Balance observations: approximately every 30 seconds
- Accounting reconciliation: approximately every 5 minutes when an anchor exists
- Market quotes: refreshed at most every 5 minutes and considered expired after 10 minutes

Provider errors, rate limits, stale quotes, sleep, and network loss can delay those cycles. The last verified period may remain visible with its status instead of being silently replaced.

A repeated finalized slot leaves the last verified receipt intact until the
chain advances. It cannot create a second accounting checkpoint for the same
slot or count the same rewards and costs twice.

## Activity versus earnings

Activity shows the saved accrual journal and, in a separate view, changes in the observed unrefined balance. These are not added together. Accrual entries are gross increases before claim fees, bounded by the times they were observed; an overnight catch-up entry may span more than one day. The journal starts when tracking begins and does not reconstruct rewards from before its baseline. Claims and missing observations can leave gaps.

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
Active automations, deployed funds or unclaimed SOL prevent a closed cost
boundary, so rewards can accrue while net remains unavailable. The app never
relaxes this check or treats active funding as a realized loss. Independent
quotes and gross holdings remain available even without an accounting anchor.
