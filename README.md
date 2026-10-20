# Next Chapter

Your job applications, their status, notes and next steps, right in a new Chrome tab. Everything stays in your browser. This first version focuses on the application tracker; Today, Tasks and Calendar are still previews.

## Try v0.1.0 — no npm needed

Want to give it a spin? Grab **next-chapter-v0.1.0.zip** from the [release downloads](https://github.com/shk0d/next-chapter/releases/tag/v0.1.0). Choose that file rather than GitHub’s automatic “Source code” ZIP.

1. Extract the ZIP into a folder you’ll keep around.
2. Open `chrome://extensions` in Chrome 120 or newer.
3. Turn on **Developer mode**, click **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Open a new tab. Accept Chrome’s new-tab replacement prompt if it appears, then add your first application or import a CSV.

That’s all you need for manual tracking—no Node, npm, account or backend. Leave the extracted folder in place because Chrome loads the extension from it. This is an early unpacked build, not a Chrome Web Store install.

### Before you connect email

**Gmail uses our Google OAuth app, which is still in testing. You need to be on its test-user list before you can connect.** Send me the Google account email you want to use, and I’ll add it. Once you’re added, open **Connections**, choose your scan range, click **Connect Gmail**, and sign in with that exact account. Downloading the ZIP or getting repository access does not add you to the OAuth list, and being on the list does not give us access to your inbox—you still grant access through Google yourself.

**We have not configured Outlook / Microsoft OAuth.** The Outlook connector is in the code, but it is not ready to connect through our setup, and this ZIP has no Microsoft client ID. For now, use Gmail or manual/CSV tracking. If you want to configure Outlook yourself, the local setup below walks you through registering your own app and rebuilding.

The email scanner is an early version and can miss application emails. Check **Review**, keep an eye on the sync status, and add missed applications manually. Connecting Gmail does not guarantee a complete import. Mail is processed locally; the app does not send it to us or an AI service.

### Updating your copy

Export a JSON backup first. Replace the files in your existing extension folder, click **Reload** on its Chrome extension card, and refresh your open dashboard tabs. Keep the same extension ID and avoid uninstalling so your local records stay available. Download checksums and the same quick-start notes are on the release page.

## Build and run it locally

If you want to change the code or use your own OAuth apps, start here. You’ll need Node.js 22.16 or newer (tested with Node 26), npm, Git and Chrome 120+.

Clone the repo and open it first:

```sh
git clone https://github.com/shk0d/next-chapter.git
cd next-chapter
```

Then install the dependencies and build the extension:

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**, and choose this project's **dist** directory.
4. Open a new tab and accept Chrome's new-tab replacement prompt if shown. Applications opens first. You can also click the extension toolbar icon.
5. Add an application or use **Import / export** to bring in a CSV. No email setup is needed for manual tracking.

After code/config changes, run `npm run build`, click **Reload** on the extension card, and refresh open extension tabs. Keep `scripts/extension-key.json`: it is a **public** key that keeps this unpacked extension's ID stable. Its private key was discarded; it cannot sign a store package. Removing it changes the ID, OAuth redirects and local storage origin. The generated ID is:

```text
pmijoeidljnohfccaeegpbenjhkfamhk
```

`npm run dev` provides a UI-only browser preview. The preview has its own local database and cannot connect email. It does not share data with the installed extension.

## Email setup (both providers)

Both connectors are implemented, but **we have only configured our Google OAuth app; we have not configured Outlook / Microsoft OAuth**. To use our Gmail setup, send me the Google account email you want to test with so I can add it to the OAuth test-user list first. Repository access does not put you on that list. You still sign in and grant access yourself.

If you build from source, the repository does not include our local OAuth configuration. You can get the public Google client ID from the release’s `manifest.json` (`oauth2.client_id`) and use it below after I add you as a test user, or register your own apps using the steps below. Outlook needs your own Microsoft registration for now. Public client IDs are not secrets; never add a client secret or token to this extension.

Copy `.env.example` to `.env.local`. Add either or both public client IDs:

```dotenv
VITE_GOOGLE_CLIENT_ID=YOUR_EXTENSION_CLIENT_ID.apps.googleusercontent.com
VITE_MICROSOFT_CLIENT_ID=YOUR_ENTRA_APPLICATION_CLIENT_ID
```

Rebuild and reload the extension. Open **Connections**, choose a lookback, and click the provider's Connect button. The optional network access prompt precedes OAuth. You can connect one Gmail and one Outlook mailbox concurrently. Each has independent sync state and errors.

### Google Cloud / Gmail

1. Create/select a Google Cloud project. Enable the **Gmail API**.
2. Configure Google Auth Platform / OAuth consent: app details, audience, and your test-user email(s). Keep the app in Testing for personal evaluation.
3. Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. Create an OAuth client with application type **Chrome Extension**. Set its application/extension ID to `pmijoeidljnohfccaeegpbenjhkfamhk` (confirm it on your loaded extension card).
5. Put the resulting client ID in `.env.local`, rebuild and reload. The builder adds the manifest `oauth2` section only when the ID exists. Sign into the intended Google account in Chrome, then connect Gmail.

Chrome Identity manages Google access-token caching and reacquisition. Gmail profile data identifies the mailbox without requesting Contacts or the `identity.email` permission. A 401 removes the cached token so subsequent sync can reacquire it; interactive reauthorization occurs only when you click Reconnect.

Gmail read-only is a **restricted scope**. Testing accounts may require test-user enrollment and re-consent when testing grants expire. Public distribution needs Google's verification process. This build has no cloud mail processing and is not a verified public OAuth app. See [Chrome OAuth setup](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth) and [Gmail scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes).

### Microsoft Entra / Outlook

1. Register an app in Microsoft Entra. Select **Accounts in any organizational directory and personal Microsoft accounts** if you want both Outlook.com and Microsoft 365.
2. Under Authentication, add a **Single-page application (SPA)** platform and register this exact redirect URI (no extra trailing slash):

   ```text
   https://pmijoeidljnohfccaeegpbenjhkfamhk.chromiumapp.org/microsoft
   ```

3. Add delegated Microsoft Graph **Mail.Read** and **User.Read** permissions. `User.Read` identifies and labels your own account through `/me`; mail tokens are treated as opaque. `offline_access` is requested for renewal within the Chrome session. No application permissions, client secret, implicit grant, Mail.Send, Mail.ReadWrite, or calendar access is used.
4. Copy the Application (client) ID to `.env.local`, rebuild and reload, then click Connect Outlook.
5. Allow Inbox initially. In connection settings you can select other top-level folders where mail rules put recruiting messages. Nested folders are not listed in this version.

The extension uses Chrome Identity `launchWebAuthFlow`, cryptographic state, and authorization code + PKCE S256. Token exchange must be allowed for your registered SPA redirect. AADSTS redirect/CORS errors usually mean the redirect was registered under the wrong platform, the public client ID is wrong, or the actual extension ID differs. Do not work around this with a secret in the extension. Organizational policy can require an administrator's consent even for delegated read access. Personal and organizational flows still require real-account validation.

Outlook access and refresh tokens live in `chrome.storage.session` only. They survive service-worker suspension but **not quitting Chrome or reloading the extension**. Reconnect Outlook after a full restart. This deliberate limitation avoids persisting refresh credentials on disk. A future persistent sign-in design is separate work.

References: [Microsoft SPA registration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-configuration), [code flow / PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [read your own profile](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0), [Chrome Identity callback](https://developer.chrome.com/docs/extensions/reference/api/identity).

## What email sync does

- Runs on demand, when a stale new tab opens, and roughly every 15 minutes while Chrome is running. Initial scans continue in short alarm-driven batches. It is not an always-on email service.
- Default lookback: 90 days; options 30, 90, 180, 365. Change the range and use Rescan to revisit old mail. Reconnecting preserves existing cursors; rescan resets them.
- Gmail searches application-related terms, reads MIME text, then uses history IDs for incremental message additions. Expired history recovers through a bounded rescan. Sent messages from the connected mailbox are skipped.
- Outlook uses **per-folder delta** with a received-date lower bound and opaque continuation URLs. Immutable message IDs are requested. Graph may cap filtered delta results; this version does not promise complete large-mailbox backfill. Use a shorter range when needed.
- Rules detect explicit application, assessment, interview, offer and rejection language. Exact company/role evidence is required for automatic creation. Ambiguous, forwarded, cross-account, manual-record, old-stage, or deleted-record matches go to **Review**. This parser is intentionally conservative and does not cover every ATS template or language.
- Exact source IDs deduplicate retries. Manual stage corrections are protected. Notes, recruiter details and actions are not overwritten by parsing. Matching is based on company + role, so separate requisitions may need review or manual separation. Dates in email are not auto-applied: add confirmed next-action dates manually.
- Keeps a short excerpt, sender, subject, received time and source link for recognized mail. Raw bodies remain transient; unrelated mail is not stored. Source deletion never deletes an application.
- Disconnect stops ingestion and removes local token state/cache; imported tracker records remain. Revoke provider consent in Google/Microsoft account settings if desired.

## Data and portability

IndexedDB is the live database. There is no server or cross-device sync. Status counts are current stages; “Reached interview” uses recorded history and survives later rejection. “Submitted” requires an applied date or a recorded Applied stage. An Offer alone does not imply a previously recorded interview.

**CSV:** export includes all applications, regardless of active filters. Expected columns are `company`, `role`, `status` and optionally `id`, `appliedDate`, `location`, `jobUrl`, `requisitionId`, `notes`, `recruiter`, `action`, `actionDate`, `actionDone`. Missing status defaults to Interested. Common columns can be mapped in the import dialog. Dates use `YYYY-MM-DD`; statuses are Interested, Applied, OA, Interview, Offer, Rejected. All validation errors must be resolved before import. Choose skip matches or import separately; importing separately generates a fresh ID for a matching record. Formula-like cells are apostrophe-prefixed on export for spreadsheet safety.

**JSON:** full versioned domain backup, including evidence, candidates, and deletion history. It excludes mailbox connections, credentials, cursors, locks and raw bodies. Merge preserves existing IDs; replace requires confirmation. Both modes disconnect mailboxes and invalidate in-flight sync, so reconnect after restoring. Treat backups as private because they contain your notes and email excerpts.

Uninstalling the extension or clearing its storage removes the local database. Export a JSON backup first. Unpacked reloads retain IndexedDB when the extension ID stays the same. Incognito split storage and cross-device syncing are not supported.

## Development and verification

`npm run package` builds v1 and creates `release/next-chapter-v0.1.0.zip` plus `release/SHA256SUMS.txt` using the system `zip` command. The archive contains the built extension and installation instructions; it excludes source, local environment files and user data. Build-time public OAuth client IDs are part of the extension when configured. Upload the ZIP and checksum as GitHub release assets; generated archives and the separate v2 workspace are excluded from Git.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests use synthetic mail and a disposable Chromium profile, without touching your personal browser profile. Run the build before browser tests, and do not rebuild while they are running.

For this v0.1.0 package, all 23 unit tests and the production build passed, and archive integrity/checksums were verified. A fresh browser-suite run could not complete because the test Chromium crashed during startup; this package has not received a new browser-test pass.
