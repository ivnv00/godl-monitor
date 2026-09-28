# Interface review — 0.2.1

Native review on Apple Silicon / macOS 27, 28 September 2026. The scope was shared controls, compact readability, goal forms, and consistency across the existing Warm Ledger surfaces. All visual and interaction fixtures were fictional and isolated from the installed monitor.

## Corrections

| Finding | Correction | Evidence |
| --- | --- | --- |
| Add goal hugged its label; other buttons compensated with arbitrary widths | Shared 12-point horizontal inset, intrinsic sizing, explicit full-width form actions, stable busy-state minimum widths | Compact Goals, full window and loading state |
| Some row actions sized their wrapper instead of their hit area | Size the label inside the button | Manage, Details and Show earlier routes |
| Goal editors differed by entry point; error text sat below the form | Matching 560×620 sheets, tighter field grouping, field-local errors and focus | Invalid zero target, correction, Ring save, compact editor |
| Wallet/RPC required clicking and shared misplaced feedback | Return submission, blank-input guards, matching fields, separate errors and confirmations | Invalid/valid synthetic address and HTTPS endpoint; secure field clears after success |
| Compact five-column earnings shrank to tiny text | Daily groups with aligned native-size asset rows and prominent net USD | 360-point pane, positive/negative days and six-decimal gold |
| Compact Escape relied on a hidden button | Visible shared Back/Close controls own Escape | Goals → overview and gold detail → overview; native sheet dismissal |
| Goal movement could swap with an invisible archived item | Reorder active goals; disable at visible boundaries | Archive middle goal, move across it, restore |
| Goal menus lacked the overview menu's feedback | Shared menu hover, focus and contrast treatment | Both menu entry points; code inspection for motion guards |
| Cross-day notifications omitted the ending date; amounts repeated in accessibility | Both dates, adaptive heading, one exact accessible amount per asset | Synthetic 25-hour intervals; accessibility tree |
| Jumping to the end of grouped notification history could leave blank space | Measured day groups within the existing 40-item pagination | 41-entry fixture, jump to bottom, Show earlier, mark all read |

These were owner-requested P2/P3 interface corrections; no financial calculations, wallet permissions or protocol operations changed.

## Coverage and limits

- **Layout/UI:** all five pages at 900×680, full-window Goals and detail sheets, 360×600 widget, add/edit/archive/restore, first-run action, populated/empty notifications. Shared insets, eight-point control corners and 40-point targets remain consistent.
- **Typography:** compact quantities use native text size; exact values stay in help/accessibility. Serif metrics and tabular numerals retain their roles.
- **Writing:** error recovery is attached to the relevant field; Back no longer announces an incorrect destination. Partial-day, fee and quote caveats remain.
- **Color:** computed contrast against intended light surfaces: body 13.71:1, secondary 9.06:1, caption 6.23:1, focus 4.58:1, errors 6.32:1, positive amounts 5.63:1.
- **Accessibility/interaction:** native Return and Escape journeys, disabled/busy states, focus/error surfaces, exact accessibility values. Reduce Motion and increased-contrast branches were reviewed in code. This is not a complete VoiceOver session or a test of every macOS accessibility preference.
- **Verification:** 50 Swift tests, 83 engine tests and 3 privacy-guard tests pass. Release compilation uses warnings as errors; the local bundle is signature-checked and privacy-scanned. GitHub-hosted CI remains subject to the existing account-level Actions restriction.

The remaining distribution requirements are tracked in [Releasing](releasing.md). This review does not authorize public publication or claim cross-version macOS certification.
