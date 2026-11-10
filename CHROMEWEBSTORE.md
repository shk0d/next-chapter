# Unpublished development build — permission and data inventory

The build is an unpacked personal/test-user extension, not a published or OAuth-verified product. Store listing, privacy policy hosting, icon assets, verified developer identity and provider production approvals remain release work.

## Purpose

Replace Chrome's new tab with a light-theme local job-application tracker and optional read-only Gmail/Outlook imports. Applications have list and pipeline views; no other dashboard tabs, general task/calendar features, or LMS integrations are included. This scope pivot changes no extension permissions or provider data behavior.

## Manifest permissions

| Permission | Actual use |
| --- | --- |
| `storage` | Session-only Outlook tokens; no `storage.sync` use. Application records are stored in IndexedDB. |
| `identity` | User-initiated Google OAuth token flow and Microsoft authorization-code redirect via Chrome Identity. |
| `alarms` | Opportunistic 15-minute polling and continuation of paginated initial scans. |
| `search` | Submit explicit header searches to the browser default provider. |
| `scripting` | Register the bundled job-page content script on sites the user enables. |
| `chrome_url_overrides.newtab` | Display this dashboard on a new tab. |

Optional host access is requested when a user connects a provider or enables a chosen job site:

| Host | Use |
| --- | --- |
| `https://gmail.googleapis.com/*` | Gmail profile, bounded message list/get and history. |
| `https://graph.microsoft.com/*` | Own profile, mail folders and per-folder message delta. |
| `https://login.microsoftonline.com/*` | Microsoft authorization/token exchange and session renewal. |
| `https://*/*` (optional declaration) | Allows asking for a specific user-selected HTTPS job-site origin at runtime. No all-site grant is requested. The common-sites action requests only the named ATS hosts. |

A bundled isolated-world content script runs only on selected, granted job-site origins. There is no browsing-history scraping, analytics, remote executable code, remote fonts, notifications, external database, paid AI API, or mail/calendar writes. `chrome.tabs.create` is used for the toolbar's Open action; no tabs permission is requested or needed. File downloads use Blob links, without downloads permission.

## Provider consent

- Gmail: `gmail.readonly`, a restricted scope. Owner-configured OAuth client. Public distribution needs the relevant Google verification; local-only processing does not waive that.
- Microsoft delegated `Mail.Read`: read mail text for stage extraction.
- Microsoft delegated `User.Read`: get the signed-in user's own stable ID and mailbox label; no token payload parsing or directory-wide profile access.
- Microsoft `offline_access`: session-scoped renewal. Refresh tokens are not placed in IndexedDB, `storage.local`, source, logs, CSV or backups.

## Data behavior

Application records/notes/history, recognized mail source evidence, review decisions, deletion tombstones, mailbox labels/settings and sync cursors remain under the extension's local origin. Gmail token caching is Chrome-managed; Outlook credentials are restricted to `storage.session`. Code does not log tokens/mail bodies. Bodies are fetched only for local processing and not retained in full; short recognized-mail excerpts are retained to explain a match. No product telemetry is sent. API calls go to the chosen provider. Opening source/job links navigates to their external website.

Disconnect removes local token state/cache and stops mailbox ingestion. Existing tracker/evidence data remains available. Provider-side consent can be revoked in the provider's account settings. Uninstall clears the extension's local data; users should export a backup first. CSV/JSON downloads are user-controlled and contain personal information. JSON has mail excerpts; neither contains credentials, private feed URLs or raw bodies.

## Before public distribution

- Validate live OAuth, renewal, revocation, test-user/tenant policies, and both Outlook account types using actual credentials.
- Complete Google restricted-scope verification, provider branding and applicable store disclosure requirements.
- Supply and review a hosted privacy policy and support contact matching actual code behavior.
- Review parser coverage with consented/redacted mail. Disclose incomplete detection and unsupported date extraction.
- Define persistent Microsoft session renewal before promising restart-proof connections.
- Add final store icons/screenshots/branding, production versioning, real users' accessibility review and deletion/export support.

Never claim the extension submits applications, sends messages, guarantees complete mailbox parsing, or syncs calendars/LMS in this build.

## Header search revision — 2026-11-07

The manifest now includes `search` to submit user-entered header searches through the browser's configured default search provider using `chrome.search.query`. Search is explicit on submit; keystrokes are not sent or stored by the extension. Connected mailbox shortcuts open the provider's inbox in a new tab. No additional mailbox scopes or host permissions are added.

## Job-page capture — 2026-11-08

The feature is off by default. Connections offers a common ATS host bundle or a user-entered HTTPS site. Chrome requests those specific host grants, and a persistent dynamic content-script registration is limited to selected, still-permitted hosts. Removing a host disables future injection and removes the current button through the settings-change listener; browser-revoked access is reconciled in the worker. Reload previously open job pages after enabling.

The script reads JobPosting JSON-LD and selected ATS heading/company/location elements. It does not read application answers, cookies, or job descriptions, send page text to a server, fill application fields, or submit applications. A review panel requires a user-triggered save. Only corrected company, role, location, sanitized job URL, Interested status, and local manual history are stored. Source URLs come from Chrome's message sender, not page-provided payloads. Query parameters are removed except recognized job identifiers, and URL credentials are rejected. Capture messages must come from a top-level tab on a selected, permitted HTTPS site. No externally-connectable page message bridge is exposed.

Repeat/concurrent saves are deduplicated within an IndexedDB transaction. Existing statuses, notes, history, and other manual data are preserved. SPA URL and job metadata changes refresh the button, and listing/non-job pages hide it when no posting is detected. Arbitrary custom pages require structured JobPosting data; fallback selectors exist for common ATS layouts and may require corrections. LinkedIn/Indeed-specific extraction and universal page coverage are not promised.
