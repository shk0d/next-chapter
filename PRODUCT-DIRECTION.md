# Product direction — 2026-11-07

## Approved scope

Next Chapter is a job application tracker only. The user explicitly narrowed the product on 2026-11-07. This decision supersedes the broader roadmap and dark dashboard in `plan.md`, `dashboard-ui-handoff.md`, and the original Figma references.

- Remove Today, Tasks, Calendar, web search, and their navigation. General productivity, consolidated calendars, and Canvas/LMS are outside the current roadmap.
- Switch to a light theme. Apply Apple design principles: clear hierarchy, system typography, restrained surfaces and color, immediate input feedback, and accessible motion.
- Keep applications, six application stages, history, notes, recruiter details, application-specific next actions, search, filters, and sorting.
- Keep manual entry, local IndexedDB persistence, CSV portability, JSON backup, email evidence/review, and both Gmail and Outlook/Microsoft 365. Existing OAuth limitations remain.
- Keep the Manifest V3 new-tab extension architecture. Localhost is the live design collaboration surface; it does not validate extension APIs or live OAuth.

## Working design proposals

The following are implementation choices for review, not additional user requirements:

- A single Applications workspace with list and pipeline views of the same records, and a focused application detail/editor.
- Off-white canvas, white surfaces, ink text, blue primary actions, subtle status colors, and a translucent toolbar.
- Connections, review, and import/export remain contextual controls rather than separate product tabs.
- Development-only `?demo=1` shows synthetic applications in a separate local database. The normal tracker and installed extension never receive these fixtures. Switching between “Demo data” and “My tracker” reloads the preview into the appropriate database.

## Acceptance

Only application-tracking surfaces are reachable. The empty tracker remains useful without email. Both list and pipeline support search/filtering and opening applications; editing, saving, deletion, import/export, and backups use the existing domain/storage code. Light styling covers details and dialogs as well as the overview. Layout remains usable on narrow screens and with reduced motion.

The three parser regressions identified during the 2026-11-06 review remain separate work; this design pivot does not resolve them.

## Live revision — compact application center

User direction: remove the page heading/hero and metric cards; move the application workspace up and remove its containing card. Status tabs carry totals and grow with a red corner badge when actions/updates need attention. Remove the duplicate status-filter and sort dropdowns; preserve status-tab filtering and default next-action sorting. Header contains web search and Gmail/Outlook inbox shortcuts that are disabled until connected.

Implementation: badges count unacknowledged applications with incomplete actions due within seven days (including overdue) or email stage history, plus pending email candidates. Selecting a status acknowledges its current badges locally; a new record revision can surface again. Review remains available separately. This is an initial interpretation of “action update” for live iteration.

Notification refinement: only OA, Interview, and Offer display update badges and grow/bolden when updates are present. All, Interested, Applied, and Rejected never display notifications. Viewing All or another non-action status does not acknowledge updates; opening the relevant action-status tab acknowledges only that status.

Pipeline is the default application view. The divider and selected underline beneath the status tabs are removed.

Browser-default web search uses Chrome's `search` API and the `search` manifest permission. Localhost cannot discover or use the browser's default engine and explains this on submit. Mailbox links use the connected Gmail label or the Outlook web inbox; provider browser sign-in still determines the active mailbox. This header search is a narrow user-requested exception to the earlier removal of web search. No tests are run during this design session per user instruction.

Pipeline notification revision: status tabs are shown only in List. Pipeline always displays all stages (subject to application search); colored column headings carry the OA/Interview/Offer update badges and become larger/bolder. Offscreen update headings dock into an edge stack, including on the left when scrolled past. The same heading elements track scroll position and smoothly unfold into their own columns, using transform-only interpolation rather than delayed scroll transitions. Clicking a docked heading reveals its column; clicking the in-place heading acknowledges its updates. Reduced motion keeps the headings in a static, wrapping strip. No test runs were performed, per the session instruction.

## Apple design review and resumed verification

The user explicitly resumed tests after the live design pass. Screenshot and interaction review found undersized heading hit areas, offscreen keyboard focus, incorrect acknowledgment behavior under reduced motion, and docked headings covering cards or competing with a revealed heading.

Headings now have 44px touch targets and immediate press feedback. Offscreen updates dock on the right, including when their columns have been scrolled past, so they cannot occupy the left-aligned revealed heading. Keyboard focus instantly reveals the actual column without acknowledging it. Reduced-motion headings remain in a static strip and acknowledge on the first activation. The stack has reserved space only where important headings can actually leave the viewport; scrolling unfolds/reverses directly without input-blocking transitions or a moving card origin. Higher-contrast mode outlines headings.

Focused browser coverage exercises narrow-screen badge visibility and touch targets, stack/card separation, intermediate scrolling and reversal, resize, no page overflow, All preserving updates, reveal vs acknowledgment, persistence after reload, keyboard activation, and reduced motion. Tests use synthetic records and disposable Chromium profiles; personal browser data is untouched. Real-device touch momentum and live OAuth remain outside automated coverage.

## Job-page capture — 2026-11-08

User-requested addition: an on-page button saves a viewed job to Interested. Implementation: opt-in per-site content scripts, a review/correction panel, structured JobPosting plus common ATS detail detection, and transactional local saves. Both new and duplicate records retain manual ownership; duplicate captures never demote an application. No application forms are filled or submitted. Settings live under Connections and stay independent of email authorization. See README for enabling and CHROMEWEBSTORE for updated actual permission/data behavior.
