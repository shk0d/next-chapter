import { captureScriptId, captureSettingsKey } from "./model";
let pending = Promise.resolve();
export function syncJobPageRegistration() {
  const work = async () => {
    const settings = await chrome.storage.local.get(captureSettingsKey);
    const origins: unknown = settings[captureSettingsKey];
    const selected = Array.isArray(origins)
      ? origins.filter(
          (o): o is string =>
            typeof o === "string" &&
            /^https:\/\/(?:\*\.)?[a-z0-9.-]+\/\*$/i.test(o),
        )
      : [];
    const permitted: string[] = [];
    for (const origin of selected)
      if (await chrome.permissions.contains({ origins: [origin] }))
        permitted.push(origin);
    if (JSON.stringify(permitted) !== JSON.stringify(selected))
      await chrome.storage.local.set({ [captureSettingsKey]: permitted });
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [captureScriptId],
    });
    if (!permitted.length) {
      if (registered.length)
        await chrome.scripting.unregisterContentScripts({
          ids: [captureScriptId],
        });
    } else {
      const script = {
        id: captureScriptId,
        matches: permitted,
        js: ["job-page.js"],
        runAt: "document_idle" as const,
        persistAcrossSessions: true,
      };
      if (registered.length)
        await chrome.scripting.updateContentScripts([script]);
      else await chrome.scripting.registerContentScripts([script]);
    }
  };
  pending = pending.catch(() => {}).then(work);
  return pending;
}
export async function allowedJobPage(sender: chrome.runtime.MessageSender) {
  if (
    !sender.tab ||
    sender.frameId !== 0 ||
    !sender.url?.startsWith("https://")
  )
    return false;
  const url = new URL(sender.url);
  const settings = await chrome.storage.local.get(captureSettingsKey);
  const origins = settings[captureSettingsKey];
  if (!Array.isArray(origins)) return false;
  return (
    origins.some((pattern: unknown) => {
      if (typeof pattern !== "string") return false;
      const host = pattern.replace(/^https:\/\//, "").replace(/\/\*$/, "");
      return host.startsWith("*.")
        ? url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))
        : url.hostname === host;
    }) && (await chrome.permissions.contains({ origins: [`${url.origin}/*`] }))
  );
}
