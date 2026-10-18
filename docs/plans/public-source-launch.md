# Public source launch — 18 October 2026

## Approval and scope

The owner explicitly approved making `ivnv00/godl-monitor` public at
`0e0a0ae581ccc7a215b266459d277b9471ac1028`, then completing private security
reporting, CI and branch protection. The visibility change was applied at that
exact revision and confirmed through an unauthenticated GitHub API read.
Only source was shared. No binary release, uploaded app, Pages site or automatic
publishing was authorized or created. The installed 0.2.39 app and private local
state were not touched. Follow-up changes describe the now-public repository and correct the native
CI compiler failure below. The reviewed network and accounting behavior is
unchanged; the earlier package hashes remain evidence for their named source.

The [source-sharing preparation](source-sharing.md) retains Daybreak Blue's
review and correction recheck, 895 local/fresh-clone tests, package checks and
privacy evidence. Those checks cover their exact candidate; they are not a
claim that a source repository or app can never contain a defect.

## Repository controls

- GitHub secret scanning and push protection are enabled. The open-alert readback
  returned zero alerts; that is a point-in-time result, not proof against every
  secret or personal-identifier format.
- Private Vulnerability Reporting is enabled. The public Security page exposes
  **Report a vulnerability**, linking to GitHub's private submission flow.
- Actions accepts GitHub-owned actions and requires full SHA pins. The default
  token is read-only and cannot approve pull requests. All external fork
  contributors require maintainer approval before running their workflows.
- Protected `main` requires pull requests and up-to-date `native`, `native-intel`
  and `engine` checks from GitHub Actions (app ID 15368), plus resolved review
  conversations. Enforcement includes administrators. Force pushes and branch
  deletion are disabled; no bypass allowance is configured.
- The solo maintainer can merge a reviewed PR after all checks pass without
  requiring an approval from a second person. There is no automatic merge or
  automatic publication.

## Hosted verification

The approved source run is
[Checks 39129675851](https://github.com/ivnv00/godl-monitor/actions/runs/39129675851)
at `0e0a0ae`: `engine` passed; both native jobs failed with a Swift type-checking
timeout in `RecordedAccrualsView.observed`. The old private-repository runs were
skipped and do not count as tests.

**P1 — blocking-in-scope:** contributor builds and the required native checks
must compile. The correction extracts the same compact and accessibility strings
into typed helpers and names the formatted date strings before constructing the
view. Amounts, separators, coverage conditions, styles and accessibility wording
are preserved. Local Xcode 27 had compiled the original expression; the hosted
failure is the regression signal. The protected follow-up PR must pass all three
checks before merge; no protection bypass or skipped native job is acceptable.

The protected follow-up is [PR #1](https://github.com/ivnv00/godl-monitor/pull/1).
Its first run, [39130300493](https://github.com/ivnv00/godl-monitor/actions/runs/39130300493),
passed both native jobs, confirming the compiler correction. The engine job
exposed a test synchronization race: the quote-concurrency test expected two
mock requests after only 100 event-loop turns, before asynchronous cache I/O
had necessarily completed. **Blocking-in-scope for reliable required CI:** the
test now awaits an explicit signal from both mock requests while keeping them
unresolved, with a test timeout for genuinely stalled behavior. Production quote
and network code are unchanged.

GitHub reported the PR as `BLOCKED` while required checks were pending and again
when the engine check failed. The [PR check history](https://github.com/ivnv00/godl-monitor/pull/1/checks)
is the gate record for the corrected candidate; all three checks must pass before
merge, and the workflow runs again on the resulting `main` commit. No admin
bypass or relaxation of required checks is used.

## Limits

Hosted native jobs compile and execute unit tests on their macOS runner and
verify its processor architecture. They do not launch the packaged window or
widget, verify clean-Mac installation/Gatekeeper, test macOS 14, or exercise
notifications, login items and physical sleep/wake. These remain explicit in
[Releasing](../releasing.md).

Settings readback and a same-repository PR cannot prove the actual approval flow
for a separate external contributor. Observe that boundary with the first real
fork contribution; never impersonate a contributor or relax the policy to test it.
