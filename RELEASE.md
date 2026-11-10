# Next Chapter v0.1.0

Thanks for trying this first version. It puts a job application tracker in your new Chrome tab, with statuses, notes, next steps, CSV import/export and a JSON backup. Your records stay in your browser. The current build focuses only on job tracking, with a light theme and List/Pipeline views.

## Install in a minute

1. Download **next-chapter-v0.1.0.zip** from this release’s assets. Choose that file rather than GitHub’s automatic “Source code” ZIP. The `latest-build` prerelease is refreshed automatically from `main`; check its commit and build results before downloading.
2. Extract it into a folder you’ll keep around.
3. Open `chrome://extensions` in Chrome 120 or newer and enable **Developer mode**.
4. Click **Load unpacked**, choose the extracted folder containing `manifest.json`, and open a new tab. Accept the new-tab replacement prompt if Chrome shows it.

You can start adding applications or importing a CSV straight away. No Node, npm, account or backend is needed for manual tracking. Keep the folder in place; Chrome loads the extension from it. This is an unpacked early build, not a Chrome Web Store installation.

## Save jobs while browsing

In **Connections → Job-page button**, enable selected job sites and approve Chrome's site-access request. Reload open job pages, then use **Add to Interested** on detected postings. Review the company/role before saving. Existing applications keep their current stage and notes; no application forms are submitted. Initial support covers structured job postings and common ATS layouts, with corrections available when details are missing.

## Email availability

Automated builds include Gmail and Outlook configuration only when the repository owner has configured those providers. The release page lists their availability. If **Connections** reports missing configuration, use manual/CSV tracking or rebuild with your own registration as described in the repository README.

Our Google OAuth app is still in testing. **Send me the Google account email you want to test with so I can add it to the OAuth test-user list before you connect.** Downloading this ZIP or getting access to the repository does not put you on that list.

Once Gmail is configured and I’ve added you, open **Connections**, choose your scan range, click **Connect Gmail**, and sign in with that exact account. You still grant access yourself through Google; adding you to the list does not give us access to your mailbox. The extension processes mail locally and does not send it to us or an AI service. Configured ZIPs include public OAuth client IDs, without credentials or mailbox data.

The original `v0.1.0` release has no Outlook / Microsoft configuration. If Outlook is available in a later build, connect through **Connections** and grant access with your own account. Organizational policy may require administrator consent.

## What to expect

The email parser is early and can miss application emails; it does not guarantee a full inbox import. Check **Review** and sync status, and add missing applications manually. The pivot keeps the current scanner unchanged; general task/calendar tabs are removed.

To update, export a JSON backup first, replace the files in the same extension folder, click **Reload** on the Chrome extension card, and refresh open dashboard tabs. Keep the same extension ID; do not uninstall to update. If you configure Outlook yourself, reconnect it after reloading.

## Package checks

Automated `latest-build` downloads are published only after unit tests, the production build, built-extension browser tests and ZIP/checksum checks pass. Browser tests use synthetic mail; they do not validate real-account OAuth or mailbox coverage. See the release page for the commit and workflow results.

For the original `v0.1.0` package, all 23 unit tests and the production build passed, and ZIP integrity/checksums were checked. Its browser suite was attempted, but the test Chromium crashed during startup, so that original package has no fresh browser-test pass.

`SHA256SUMS.txt` is included with the release downloads. For local builds and optional email configuration, see the repository README.
