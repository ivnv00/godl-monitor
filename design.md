# GODL Monitor — Warm Ledger

Warm Ledger is the native SwiftUI design system for GODL Monitor: warm ivory, muted brass, espresso text and expressive serif metrics. Shared components and tokens define all app and menu-bar surfaces.

## Surfaces and structure

WarmLedger.swift owns ivory/taupe surfaces, espresso text, muted brass controls and green/red financial results. Use its colors. Full window retains its 188-point sidebar, 1104×858 default, 900×680 minimum; menu-bar overview stays 360×600. Main pages share one header, 40-point horizontal gutters and 24-point section rhythm. Detail bodies use 24-point padding; compact detail bodies use 22. Shared detail headers/footers own back/close and Done actions. Notification history is available from both window and popover.

Both overviews prioritize daily earnings, then matching refined/gold cards and goal progress. Equal columns have equal card heights, internal padding and value baselines. Cost/history details retain their existing routes and data. Charts and numeric scales remain truthful to the model; no financial-calculation changes.

## Type and controls

LedgerType owns upright system-serif display numbers and system sans-serif labels/body. Tabular numerals for amounts/time, no italic headings. Shared body, meta, caption and section roles; reserve large serif metrics for the quantity of interest. Controls use LedgerButtonStyle, LedgerIconButtonStyle or LedgerRowButtonStyle, with 40-point desktop targets, visible focus/hover/pressed/disabled states and consistent eight-point control corners. Text buttons have twelve-point horizontal insets and fit their labels by default. Opt into full width for form footers and first-run actions; use a minimum width for labels that change while busy. Apply hit-area sizing inside the button label, so the whole visible target responds. Menu controls share hover/focus treatment, and all detail Back/Close controls use Escape. Cards use twelve-point corners and sixteen-point padding.

## Content and states

Short titles, concise labels, source/caveat detail behind disclosures or help. Preserve partial-day, quote-expiry, observed-balance-versus-income, claim-fee and accounting-coverage distinctions. Unavailable values stay unavailable rather than zero. History continues while the app runs with its windows closed; quit/sleep catch-up is limited by observed data.

Disclosures use LedgerDisclosureStyle: a full-width, minimum 44-point row with a clear Show/Hide action, hover/focus feedback and an announced expanded/collapsed state. No tiny native disclosure arrows. The whole row is clickable in both windows and the menu-bar panel.

Reward cards reveal the approximate current USD value beside the asset unit immediately on hover, preserving the token amount and card geometry. Use the existing holdings valuation and quote-expiry check; unavailable or expired values say USD unavailable. The detailed tooltip retains the quote source and before-claim-fee context.

## Asset denominations

Use LedgerAmount for standalone token quantities: the official GODL mark for unrefined and refined GODL, and the original native vector gold bar for XAUt0. Gold is generic UI artwork, not a token issuer logo. LedgerAssetMark owns sizing, baseline alignment and decorative accessibility behavior; WarmLedger owns its three gold tones. Keep the textual unit in reward cards, detailed selectable amounts, help and accessibility. USD amounts retain their dollar sign and never receive a token mark.

Dense accrual and earnings tables place the denomination once in each column header; cells and chart axes remain numeric. Compact earnings rows, notifications, balance movements, selected chart quantities and goal values carry their asset mark. Reward cards use the mark in their header so it does not compete with the main amount. Preserve supplied signs, approximation, decimal precision and unavailable values. Exact details wrap without truncation; compact displays retain their existing rounding and exact help.

## Motion and verification

Existing LedgerMotion transitions only; Reduce Motion disables decorative movement. No layered outgoing refresh icon under a spinner. Verify full window at default and minimum size, all five pages, each detail type and the compact overview. Inspect loading/unavailable/failed/expired states with isolated fixtures. Native app sizing replaces web breakpoint requirements. No generated imagery or new dependencies.

## Editable goals

The former fixed 10K roadmap is now a locally saved goal. Shared GoalsSummary visualizations show pinned goals in both overviews. A single widget goal uses its natural height with no scroll container. Multiple widget goals share a viewport capped at 190 points so the menu-bar panel remains 360×600; the full Overview lets its page own scrolling for any goal count. Both app roots use size-based scroll bounce, inherited by lists, forms and details, so fitting content stays still while overflow remains reachable. A Goals page (Command-5) and compact Goals panel share add, edit, pin, reorder, archive and restore controls. Goal titles and positive decimal targets are editable, with native focus and inline validation; the compact editor uses back/Escape navigation and the full window uses a sheet.

Five metrics: current unrefined GODL, claimable refined GODL, claimable XAUt0 gold, combined claimable USD before claim fees, and today's covered net USD reward. USD uses existing fresh quotes and all required values. Daily progress uses today's date in the accounting timezone, retains partial coverage and never carries yesterday forward. Balance goals are current snapshots, so progress can decrease after claims; USD progress can decrease when prices change. Missing values stay unavailable.

Versioned goals.json is separate from accounting and scoped to wallet, network genesis and program. The existing target seeds once per identity; intentionally empty or archived lists never reseed. Saves are atomic, mode 0600; invalid or newer data stays untouched and disables editing. No miner, claim, accounting or notification behavior changes.

## Goal presentation templates

Roadmap is the default, including migration of existing goals: a prominent 68-point ring, serif current amount and four milestone stops at 10%, 25%, 50% and 100%. Ring and Bar are per-goal alternatives, selected through illustrated controls in the editor. Exact targets are unchanged; current display rounds conservatively with approximation and exact hover/accessibility values. Multiple pinned goals scroll inside a bounded widget region. The full app and widget share the chosen visualization. Full-window goal editors are 560×620, matching other detail sheets; the compact editor keeps its actions visible below a scrolling body. Validation appears beside the affected field and returns focus there. Reordering uses active goals and skips archived items.

## Narrow ledgers and forms

The full window keeps the column-based earnings table. At menu-bar width, Exact amounts uses a daily group with net USD in its header and aligned asset rows at native text size. Hover and accessibility retain exact quantities, quote status and fee context. Never shrink five columns into the compact panel. Cross-day notification intervals show both dates and move beneath the entry title when space is tight.

Wallet and private RPC inputs share field surfaces and submit with Return. Blank inputs cannot submit. Invalid input stays focused with local error text; success clears focus, and RPC success clears the secure field. Each form owns its own feedback. Private RPC uses Check & save with a stable-width busy label and Cancel. A failed or cancelled check preserves the prior endpoint and the typed value. Closing the section or leaving Settings cancels its check. Only a verified Mainnet response can commit the new endpoint; raw provider errors never reach the form.

## Login preference

Settings uses a native switch for Launch at login with the existing section and
meta type. Read macOS state, not an optimistic saved boolean. Keep the switch
visible while updating; disable repeat actions and show a small busy indicator.
Approval needed is an off, disabled switch with Open Login Items and Cancel
registration actions. Failures preserve the actual state and show fixed recovery
text. Guidance wraps at minimum window width. Native switch behavior and Ledger
buttons retain keyboard focus, hover and disabled feedback; no added animation.

## Activity ledger

Activity opens with today’s net earnings for the available accounting interval, then an accrual ledger grouped by observation day. Asset filters select entries containing an increase; they never change accounting totals. Each amount exposes exact quantity and an approximate fresh USD value on hover. Catch-up intervals retain both dates across midnight and are not allocated into invented daily earnings. Viewing Activity does not acknowledge notification read state.

Balance changes are a separate view of unrefined principal movements, with neutral increase/decrease labels and exact before/after evidence. Initial and unchanged observations produce no rows. Missing or invalid observations break the comparison baseline. Full source observations remain in local storage. Show earlier reveals 40 more meaningful entries; no polling counters or slot numbers appear in the main ledger. Overview reuses the three most recent accruals.

Activity's accrual controls include Export CSV beside the asset filter. It uses
the shared 40-point button and stable loading width, then the native save dialog.
Export scope follows the selected rows across all pagination. Empty or unreadable
history disables export; fixed error/success feedback appears in an anchored
popover. No new widget control, color, typography or motion system is introduced.

## Goals and activity transfer

Settings exposes Save backup beneath Goals & activity; Wallet setup exposes
Restore backup. Review uses the shared 560×620 detail sheet, scrollable content,
fixed footer and standard file dialogs. Show wallet, counts, date and concise
privacy/scope before either action. Loading disables repeat actions; failures
keep the current profile untouched and show fixed inline recovery text. Restore
success fills the normal wallet form without switching the active monitor.
Menu-bar first-run setup opens the overview for this review. Use existing type,
colors, focus and interaction states; no new animation or component system.

The compact recorded-rewards card uses one “Recorded today” heading, a serif
USD estimate, a visible before-fees-and-costs qualifier and three quiet asset
columns. The whole card opens daily details. Net availability belongs to a
status icon with accessible help and the detail page, preserving the distinction
between recorded gross rewards and verified net earnings.


## Recorded reward history

The daily chart defaults to saved gross rewards, with current-price value and
per-asset choices. Seven-day windows have native Previous/Next controls and a
Today return; gaps remain dashes. Exact recorded amounts use a disclosure. The
covered accounting chart and amounts stay in a separate Verified net disclosure.
Use the same component in the full window and compact daily details. The last
verified mining result shows both period endpoints beside its unrefined-only
scope; current-price valuation remains explicit.
