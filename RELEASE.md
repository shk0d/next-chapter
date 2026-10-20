# Next Chapter v0.1.0

Thanks for trying this first version. It puts a job application tracker in your new Chrome tab, with statuses, notes, next steps, CSV import/export and a JSON backup. Your records stay in your browser. Today, Tasks and Calendar are still previews.

## Install in a minute

1. Download **next-chapter-v0.1.0.zip** from this release’s assets. Choose that file rather than GitHub’s automatic “Source code” ZIP.
2. Extract it into a folder you’ll keep around.
3. Open `chrome://extensions` in Chrome 120 or newer and enable **Developer mode**.
4. Click **Load unpacked**, choose the extracted folder containing `manifest.json`, and open a new tab. Accept the new-tab replacement prompt if Chrome shows it.

You can start adding applications or importing a CSV straight away. No Node, npm, account or backend is needed for manual tracking. Keep the folder in place; Chrome loads the extension from it. This is an unpacked early build, not a Chrome Web Store installation.

## Gmail: ask me to add you first

Our Google OAuth app is still in testing. **Send me the Google account email you want to test with so I can add it to the OAuth test-user list before you connect.** Downloading this ZIP or getting access to the repository does not put you on that list.

Once I’ve added you, open **Connections**, choose your scan range, click **Connect Gmail**, and sign in with that exact account. You still grant access yourself through Google; adding you to the list does not give us access to your mailbox. The extension processes mail locally and does not send it to us or an AI service. The ZIP includes our public Google OAuth client ID, without credentials or mailbox data.

## Outlook is not configured yet

**We have not configured an Outlook / Microsoft OAuth app for this release.** The connector is implemented, but this ZIP has no Microsoft client ID, so you cannot connect Outlook through our setup yet. Use Gmail or manual/CSV tracking for now. If you want to use your own Microsoft registration, the repository README explains how to configure it and rebuild locally.

## What to expect

The email parser is early and can miss application emails; it does not guarantee a full inbox import. Check **Review** and sync status, and add missing applications manually. This release keeps the current scanner unchanged. Today, Tasks and Calendar are previews.

To update, export a JSON backup first, replace the files in the same extension folder, click **Reload** on the Chrome extension card, and refresh open dashboard tabs. Keep the same extension ID; do not uninstall to update. If you configure Outlook yourself, reconnect it after reloading.

## Package checks

All 23 unit tests and the production build passed. ZIP integrity, its SHA-256 checksum and exact correspondence to the production build were checked. The browser suite was attempted, but the test Chromium crashed during startup, so a fresh browser-test pass is not claimed.

`SHA256SUMS.txt` is included with the release downloads. For local builds and optional email configuration, see the repository README.
