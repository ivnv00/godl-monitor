# Recorded rewards and resource efficiency

Owner requested on 16 October 2026 after the gold-readings recovery. Keep this
checklist current through implementation and installed verification.

- [x] Restore trustworthy gold quotes, current protocol observations and prior
  reward-journal access; install 0.2.31 with preserved profile state.
- [x] Explain the blank daily card: recovered cross-day intervals cannot be
  attributed to one day, and the current summary excludes them entirely.
- [x] Surface proven catch-up amounts with their actual observation dates when
  today's saved intervals are absent; keep calendar-day totals and charts honest.
- [x] Measure app/helper CPU, memory, file handles and storage growth separately
  from retained development, installer and rollback artifacts.
- [x] Remove confirmed repeated evidence/recovery work and incompatible automatic
  reconciliation retries, preserving explicit recovery and all original evidence.
- [ ] Verify the changed seams, resource improvement and bounded live behavior;
  run repository gates and inspect window and widget.
- [ ] Build, validate and install the next local candidate, preserve history and
  settings, and record remaining limitations and measured evidence.

## Invariants and delivery boundary

Exact raw amounts and read states remain authoritative. A multi-day increase is
never relabelled as today's income, and absence is never converted to zero.
Show both the actual observation range and the before-fees/costs qualifier.
Fresh, independently checked quotes remain optional; native quantities survive
price failure. Net accounting remains dated across an unsupported program upgrade.

Do not delete observations, journals, anchors or accounting evidence to improve
resource statistics. Derived work may be avoided only when the same proof and
freshness boundaries remain valid. No mining, claims, wallet controls, publishing
or new automatic jobs. Preserve a binary rollback and consistent private data
backup before replacement. Performance claims must name their observation window;
short samples cannot prove the absence of every long-term leak or GPU issue.

## Implementation evidence

Synthetic checks preserve exact catch-up amounts, actual interval dates, today's
separate totals, future/old/invalid interval exclusion and unavailable prices.
The historical selector excludes out-of-window evidence before file/SQLite work,
retaining spanning intervals, DST boundaries and same-day claim attribution.
Known incompatible accounting skips automatic startup/timer/wake retries when
its current and historical source markers are available. Manual retries and
unknown states retain their recovery path. An early startup with no accepted
monitor can still probe once; this is bounded, not a recurring retry policy.

One independent review found no P0/P1 blocker. A queued wake following an active
accounting helper can still trigger one redundant follow-up through the manual
retry path; it remains a deferred P2. Existing funded-fallback status limitations
remain in the roadmap. Retained evidence and installer archives are intentional
storage; no observation, journal or original accounting evidence was deleted.

The next local installation uses an Apple silicon package. Universal packaging
remains supported, with the prior universal app retained for rollback. Native
Intel/minimum-OS/public-release validation limits remain unchanged.

The source milestone passes 746 local tests: 204 Swift, 475 engine and 67 Python.
The native parse/plot benchmark remains bounded for 10,000 observations. This is
functional and bounded-work evidence, not an assertion of perfect performance.
