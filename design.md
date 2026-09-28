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

## Motion and verification

Existing LedgerMotion transitions only; Reduce Motion disables decorative movement. No layered outgoing refresh icon under a spinner. Verify full window at default and minimum size, all five pages, each detail type and the compact overview. Inspect loading/unavailable/failed/expired states with isolated fixtures. Native app sizing replaces web breakpoint requirements. No generated imagery or new dependencies.

## Editable goals

The former fixed 10K roadmap is now a locally saved goal. Shared GoalsSummary visualizations show pinned goals in both overviews; they use a bounded 190-point scrolling area so the menu-bar panel remains 360×600. A Goals page (Command-5) and compact Goals panel share add, edit, pin, reorder, archive and restore controls. Goal titles and positive decimal targets are editable, with native focus and inline validation; the compact editor uses back/Escape navigation and the full window uses a sheet.

Five metrics: current unrefined GODL, claimable refined GODL, claimable XAUt0 gold, combined claimable USD before claim fees, and today's covered net USD reward. USD uses existing fresh quotes and all required values. Daily progress uses today's date in the accounting timezone, retains partial coverage and never carries yesterday forward. Balance goals are current snapshots, so progress can decrease after claims; USD progress can decrease when prices change. Missing values stay unavailable.

Versioned goals.json is separate from accounting and scoped to wallet, network genesis and program. The existing target seeds once per identity; intentionally empty or archived lists never reseed. Saves are atomic, mode 0600; invalid or newer data stays untouched and disables editing. No miner, claim, accounting or notification behavior changes.

## Goal presentation templates

Roadmap is the default, including migration of existing goals: a prominent 68-point ring, serif current amount and four milestone stops at 10%, 25%, 50% and 100%. Ring and Bar are per-goal alternatives, selected through illustrated controls in the editor. Exact targets are unchanged; current display rounds conservatively with approximation and exact hover/accessibility values. Multiple pinned goals scroll inside a bounded widget region. The full app and widget share the chosen visualization. Full-window goal editors are 560×620, matching other detail sheets; the compact editor keeps its actions visible below a scrolling body. Validation appears beside the affected field and returns focus there. Reordering uses active goals and skips archived items.

## Narrow ledgers and forms

The full window keeps the column-based earnings table. At menu-bar width, Exact amounts uses a daily group with net USD in its header and aligned asset rows at native text size. Hover and accessibility retain exact quantities, quote status and fee context. Never shrink five columns into the compact panel. Cross-day notification intervals show both dates and move beneath the entry title when space is tight.

Wallet and private RPC inputs share field surfaces and submit with Return. Blank inputs cannot submit. Invalid input stays focused with local error text; success clears focus, and RPC success clears the secure field. Each form owns its own feedback.
