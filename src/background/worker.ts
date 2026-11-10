import { saveJobPage } from "../job-pages/save";
import {
  allowedJobPage,
  syncJobPageRegistration,
} from "../job-pages/registration";
import { captureSettingsKey } from "../job-pages/model";
import { db } from "../db/database";
import { syncAccount } from "./sync";
const periodic = "email-sync";
const continuation = "email-continue";
async function ensureAlarm() {
  if (!(await chrome.alarms.get(periodic)))
    await chrome.alarms.create(periodic, { periodInMinutes: 15 });
}
async function run(force = false) {
  const d = await db();
  const accounts = await d.getAll("accounts");
  let more = false;
  for (const a of accounts) {
    if (
      !a.connected ||
      (!force &&
        (a.nextFolder ?? 0) === 0 &&
        a.lastSync &&
        Date.now() - Date.parse(a.lastSync) < 10 * 60_000 &&
        !(await d.getAll("cursors")).some(
          (c) => c.accountId === a.id && !c.complete,
        ))
    )
      continue;
    if (force && a.retryAt && a.retryAt > Date.now()) continue;
    const r = await syncAccount(a.id);
    more ||= r.more;
  }
  if (more) await chrome.alarms.create(continuation, { delayInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(() => {
  void syncJobPageRegistration().catch(() => {});
  void ensureAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  void syncJobPageRegistration().catch(() => {});
  void ensureAlarm();
  void run();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if ([periodic, continuation].includes(alarm.name)) void run();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "SAVE_JOB_PAGE") {
    void allowedJobPage(sender)
      .then(async (allowed) => {
        if (!allowed)
          throw new Error(
            "Enable this job site in Next Chapter Connections first.",
          );
        return saveJobPage(message.draft, sender.url!);
      })
      .then((result) => respond({ ok: true, ...result }))
      .catch((error) =>
        respond({ ok: false, error: (error as Error).message }),
      );
    return true;
  }
  // Mail sync/settings are extension-page operations, never page-script actions.
  if (!sender.url?.startsWith(chrome.runtime.getURL(""))) return;
  if (message?.type === "JOB_PAGE_SETTINGS") {
    void syncJobPageRegistration()
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  if (message?.type !== "SYNC") return;
  void ensureAlarm()
    .then(() => run(!!message.force))
    .then(() => respond({ ok: true }))
    .catch(() => respond({ ok: false }));
  return true;
});
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[captureSettingsKey])
    void syncJobPageRegistration().catch(() => {});
});
chrome.permissions.onRemoved.addListener(() => {
  void syncJobPageRegistration().catch(() => {});
});
