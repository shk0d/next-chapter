import { detectJobPage } from "./detect";
import { captureSettingsKey, type JobDraft } from "./model";
// No forms, descriptions, cookies, or authentication data are read.
let host: HTMLDivElement | undefined;
let currentKey = "";
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function remove() {
  host?.remove();
  host = undefined;
  currentKey = "";
}
function render(draft: JobDraft) {
  const sourceUrl = location.href;
  const key = `${sourceUrl}|${draft.company}|${draft.role}`;
  if (key === currentKey && host?.isConnected) return;
  remove();
  currentKey = key;
  host = document.createElement("div");
  host.dataset.nextChapterJobButton = "true";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483646;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#242529;color-scheme:light}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:1px solid #dcdde4;border-radius:10px;padding:11px 15px;background:white;color:inherit;min-height:44px}button:hover{background:#f4f5f8}button:active{background:#e5eaf6}button:disabled{opacity:.6;cursor:default}button.primary{background:#3864d9;border-color:#3864d9;color:white;font-weight:600}.launcher{box-shadow:0 5px 22px #26334b24;display:flex;align-items:center;gap:10px}.mark{font-size:20px}.panel{width:min(330px,calc(100vw - 32px));background:white;border:1px solid #dedfe7;border-radius:16px;padding:20px;box-shadow:0 12px 48px #26334b26;margin-bottom:10px}.panel[hidden]{display:none}h2{font-size:17px;margin:0 0 6px}p{font-size:12px;color:#6b6d77;margin:0 0 15px}label{display:block;font-size:12px;color:#626775;margin:12px 0}input{display:block;width:100%;margin-top:5px;border:1px solid #dcdde4;border-radius:8px;padding:10px;color:#242529;background:white}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.status{font-size:12px;margin-top:12px;overflow-wrap:anywhere}.close{float:right;padding:3px 9px;min-height:32px;border:0}button:focus-visible,input:focus-visible{outline:3px solid #3864d970;outline-offset:3px}@media(max-width:600px){:host{right:16px;bottom:16px}input{font-size:16px}}`;
  const panel = document.createElement("form");
  panel.className = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Save job to Next Chapter");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close save job");
  const heading = document.createElement("h2");
  heading.textContent = "Save for later";
  const intro = document.createElement("p");
  intro.textContent = "Add this role to Interested in Next Chapter.";
  panel.append(close, heading, intro);
  const field = (name: keyof JobDraft, label: string) => {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement("input");
    input.name = name;
    input.value = draft[name];
    input.maxLength = 200;
    input.required = name !== "location";
    wrapper.append(input);
    panel.append(wrapper);
    return input;
  };
  const company = field("company", "Company");
  const role = field("role", "Role");
  const locationInput = field("location", "Location (optional)");
  const status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary";
  save.textContent = "Save to Interested";
  actions.append(save);
  panel.append(status, actions);
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "launcher";
  launcher.textContent = "+ Add to Interested";
  launcher.setAttribute("aria-expanded", "false");
  const dismiss = () => {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  };
  close.addEventListener("click", dismiss);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      dismiss();
    }
  });
  launcher.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    panel.hidden = !panel.hidden;
    launcher.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) (company.value ? role : company).focus();
  });
  panel.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.isTrusted || save.disabled) return;
    if (location.href !== sourceUrl) {
      status.textContent = "This page changed. Close this panel and try again.";
      return;
    }
    save.disabled = true;
    status.textContent = "Saving…";
    try {
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_JOB_PAGE",
        draft: {
          company: company.value,
          role: role.value,
          location: locationInput.value,
        },
      });
      if (!response?.ok)
        throw new Error(
          response?.error || "Could not save this job. Try again.",
        );
      status.textContent = response.existing
        ? `Already tracked · ${response.status}. Your existing application is unchanged.`
        : "Saved to Interested. Open a new tab to see it.";
      launcher.textContent = response.existing
        ? `Already tracked · ${response.status}`
        : "✓ Saved to Interested";
      save.textContent = response.existing ? "Already tracked" : "Saved";
      company.readOnly = role.readOnly = locationInput.readOnly = true;
    } catch (error) {
      status.textContent = chrome.runtime?.id
        ? (error as Error).message
        : "Extension updated. Reload this job page and try again.";
      save.disabled = false;
    }
  });
  shadow.append(style, panel, launcher);
  document.documentElement.append(host);
}
function scan() {
  if (disposed) return;
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    const draft = detectJobPage(document, location.href);
    if (draft) render(draft);
    else remove();
  }, 250);
}
const observer = new MutationObserver((records) => {
  if (records.some((r) => !host?.contains(r.target) && r.target !== host))
    scan();
});
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
});
let lastUrl = location.href;
const poll = setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    remove();
    scan();
  }
}, 1000);
const dispose = () => {
  disposed = true;
  observer.disconnect();
  clearInterval(poll);
  clearTimeout(timer);
  remove();
};
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "JOB_BUTTON_DISABLED") dispose();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[captureSettingsKey]) return;
  const value: unknown = changes[captureSettingsKey].newValue;
  const patterns = Array.isArray(value)
    ? value.filter((p): p is string => typeof p === "string")
    : [];
  const allowed = patterns.some((p) => {
    const hostPattern = p.replace(/^https:\/\//, "").replace(/\/\*$/, "");
    return hostPattern.startsWith("*.")
      ? location.hostname.endsWith(hostPattern.slice(1)) ||
          location.hostname === hostPattern.slice(2)
      : hostPattern === location.hostname;
  });
  if (!allowed) dispose();
});
scan();
