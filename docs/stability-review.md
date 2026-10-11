# Window and history stability — 0.2.2

> Historical review: versions and test totals below describe the dated milestone.
> See [current status](current-status.md) for the current candidate and evidence.

Native verification on Apple Silicon / macOS 27, 28 September 2026.

## Reported window disappearance

The reported symptom was an overview window disappearing after a title-bar
double-click; the menu-bar process stayed alive. No matching process-crash report
was found. The system preference was Maximize. Repeated title-bar double-clicks,
the native green button and Window → Zoom worked during reproduction. The exact
original trigger remains unconfirmed; the separate history crash below is not
presented as its cause.

The overview now tracks its actual SwiftUI window instead of searching by title.
Opening it waits until the native popover has finished closing, restores a
minimized window, and brings it forward after SwiftUI has attached it. If its
title-bar controls are outside all visible screen areas, it is recentered.

The off-screen recovery case was reproduced: AppKit constrained a test window to
a small visible sliver, so checking only window/screen intersection still left
its controls inaccessible. Checking the title-bar control region recovered the
same window to a usable position.

## Separately discovered history crash

**P1, blocking in scope:** history token displays were not validated. A malformed
negative display could reach the chart and construct a descending closed range,
which traps. A regression test first failed for five malformed representations,
then passed with validation at the file boundary. Invalid snapshots are rejected;
the existing refresh failure path retains the previous accepted observation.

Validation compares canonical strings without narrowing principal amounts to
UInt64. It preserves null observations, exact larger integers and nonnegative
balance decreases after claims. Chart construction independently rejects invalid
or duplicate coordinates and keeps its domain finite even at the largest finite
Double. Unknown data remains unavailable rather than an invented zero.

Flat runs of identical balances now keep only their first and last drawing
points. This preserves both sides of every step, all changes and the time span.
At this milestone, the complete exact history remained in Activity and the observation database. Version 0.2.3 replaces the Activity refresh list with meaningful movements; the database retains the full source history.
The synthetic 10,000-sample, four-level native chart draws eight points; a
100,000-sample constant-series test draws two without removing source observations.

## Verification

- 55 Swift tests, 83 engine tests, and 3 privacy-guard tests passed.
- Six title-bar maximize/restore transitions with expanded synthetic history.
- Maximize/restore on all five pages at the minimum window size.
- Menu-bar → overview after native minimize and close; window visibility,
  non-minimized state and key-window focus checked through native diagnostics.
- Off-screen title-bar recovery; default window size; visual chart inspection.
- Release build passed with warnings as errors; source/package privacy scans and
  the local ad-hoc signature check passed. The installed build passed two more
  title-bar transitions and the menu-bar → overview handoff. Upgrade verification
  preserved existing observation rows, saved settings, goals and inbox read states,
  and confirmed that fresh finalized observations resumed.

The preview uses fictional data and the production app scene, window attachment
and menu-bar controller. A preview fixture under a File Provider-managed folder
briefly blocked file opening; moving test fixtures to a local temporary directory
removed that test-environment delay. It was not attributed to the installed app.

## Remaining limits

The original disappearance was not reproduced, and this is not a guarantee of
bug-free operation or certification across macOS versions, Spaces and multiple
physical monitors. Full-screen tiling is not enabled for this accessory app;
Zoom/Maximize was the tested operation. No wallet, monetary or protocol behavior
was changed.

One independent review plus a focused P1 recheck found no remaining P0/P1 in the
changed history seam. The broader monetary-validation finding was partially
resolved after this review: 0.2.20 validates current GODL/SOL balances and
automation amounts; 0.2.26 validates current holdings USD against exact token
amounts and matching quotes. Validation of legacy saved goal fields remains
deferred. Retrying failed system-notification delivery also remains open (the
reward stays in the inbox). Those remaining items require separate acceptance
and tests; speculative child-process pipe pressure was not established as a defect.

## If a window disappears again

Choose **Overview** from the menu-bar widget to restore it. Native lifecycle
diagnostics record close, minimize, focus and resize flags plus window dimensions:

```sh
log show --last 10m --info --style compact \
  --predicate 'subsystem == "dev.godl.monitor" AND category == "overview-window"'
```

These messages contain no wallet, balances, endpoints or screen contents. They
stay in the Mac's unified log; the app does not upload them. Review any report
before sharing, as system-added process metadata can still be identifying.
