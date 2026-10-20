import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
test.describe.configure({ mode: "serial" });
let context: BrowserContext;
let page: Page;
let base: string;
let profile: string;
test.beforeAll(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "next-chapter-test-"));
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 1024 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  base = `chrome-extension://${id}/index.html`;
  page = await context.newPage();
  await page.goto(base);
});
test.afterAll(async () => {
  await context?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});
test("new-tab override loads packaged assets, empty state and real persistence", async () => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("heading", { name: "Your next chapter starts here" }),
  ).toBeVisible();
  const manifest = JSON.parse(await fs.readFile("dist/manifest.json", "utf8"));
  expect(manifest.chrome_url_overrides.newtab).toBe("index.html");
  const newTab = await context.newPage();
  await newTab.goto("chrome://newtab/");
  await expect(
    newTab.getByRole("heading", { name: "Applications", exact: true }),
  ).toBeVisible();
  expect(await newTab.evaluate(() => chrome.runtime.id)).toBe(
    new URL(base).host,
  );
  await newTab.close();
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Acme");
  await page.getByLabel("Role", { exact: true }).fill("Software Engineer");
  await page.getByLabel("Status", { exact: true }).selectOption("Applied");
  await page.getByLabel("Applied date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("What’s next?").fill("Prepare interview");
  await page.getByLabel("Due date (local date)").fill("2026-10-22");
  await page.getByLabel("Application notes").fill("Discussed with recruiter.");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(
    page.getByRole("button", { name: /Acme Software Engineer/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Acme Software Engineer/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/applications-1440.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("generic detail, status history, search and filters", async () => {
  await page.getByRole("button", { name: /Acme Software Engineer/ }).click();
  await expect(page.getByLabel("Application notes")).toHaveValue(
    "Discussed with recruiter.",
  );
  await page.getByRole("button", { name: "Edit application" }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Interview");
  await page.getByRole("button", { name: "Save application" }).click();
  await page.getByRole("button", { name: "Interview 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Acme Software Engineer/ }),
  ).toBeVisible();
  await page.getByLabel("Search applications").fill("No match");
  await expect(
    page.getByRole("heading", { name: "No applications found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: /Acme Software Engineer/ }).click();
  await page.screenshot({
    path: "test-results/application-detail-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "All applications" }).click();
});
test("two new tabs preserve unrelated writes and reject stale edits", async () => {
  const second = await context.newPage();
  await second.goto(base);
  await second.getByRole("button", { name: /Acme Software Engineer/ }).click();
  await second.getByRole("button", { name: "Edit application" }).click();
  await page.getByRole("button", { name: /Acme Software Engineer/ }).click();
  await page.getByRole("button", { name: "Edit application" }).click();
  await page.getByLabel("Application notes").fill("Updated in first tab");
  await page.getByRole("button", { name: "Save application" }).click();
  await second.getByLabel("Application notes").fill("Stale change");
  await second.getByRole("button", { name: "Save application" }).click();
  await expect(second.getByRole("alert")).toContainText("another tab");
  await second.close();
});
test("CSV export/import and backup restore work from the built extension", async () => {
  await page.getByRole("button", { name: "Import / export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export all applications/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("applications.csv");
  await page.locator("input[type=file]").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'company,role,status,notes\nBeta,Designer,Applied,"Hello, world"',
    ),
  });
  await expect(page.getByText("1 valid rows · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Beta Designer/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import / export" }).click();
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: /Back up tracker/ }).click();
  const json = await backup;
  const saved = await json.path();
  const content = await fs.readFile(saved!, "utf8");
  expect(JSON.parse(content).applications).toHaveLength(2);
  await page.locator("input[type=file]").setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "Import file", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Beta Designer/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import / export" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
});
test("connection setup, screen skeletons, responsive UI and worker messaging", async () => {
  await page
    .getByRole("button", { name: "Connect email", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gmail", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Outlook / Microsoft 365" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect Gmail", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("VITE_GOOGLE_CLIENT_ID");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Schedule", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/today-skeleton-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    page
      .getByText("Task editing is not available yet.", { exact: false })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".calendar-preview.month")).toBeVisible();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/applications-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1024 });
  const response = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "SYNC" }),
  );
  expect(response).toEqual({ ok: true });
});
test("both mail adapters drive the built worker, and repeated sync does not duplicate records", async () => {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("next-chapter", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = database.transaction("accounts", "readwrite");
    tx.objectStore("accounts").put({
      id: "gmail:fixture@example.test",
      provider: "gmail",
      label: "fixture@example.test",
      connected: true,
      generation: "fixture-g",
      lookback: 90,
      folders: ["mailbox"],
    });
    tx.objectStore("accounts").put({
      id: "microsoft:fixture",
      provider: "microsoft",
      label: "fixture@outlook.test",
      connected: true,
      generation: "fixture-m",
      lookback: 90,
      folders: ["inbox"],
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
    await chrome.storage.session.set({
      "auth:microsoft:fixture": {
        token: "synthetic-token",
        expires: Date.now() + 3600000,
      },
    });
  });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => {
    chrome.identity.getAuthToken = async () => ({ token: "synthetic-token" });
    globalThis.fetch = async (input) => {
      const url = String(input);
      const json = (value: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(value), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      if (url.includes("gmail.googleapis.com")) {
        if (url.includes("/profile"))
          return json({
            emailAddress: "fixture@example.test",
            historyId: "100",
          });
        if (url.includes("/history?"))
          return json({
            history: [
              {
                messagesAdded: [
                  { message: { id: "g-confirm" } },
                  { message: { id: "g-unclear" } },
                ],
              },
            ],
            historyId: "101",
          });
        if (url.includes("/messages?"))
          return json({ messages: [{ id: "g-confirm" }, { id: "g-unclear" }] });
        const id = new URL(url).pathname.split("/").pop()!;
        return json({
          id,
          internalDate: String(Date.now()),
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "from", value: "jobs@orbit.test" },
              { name: "subject", value: "Application received" },
            ],
            body: {
              data: btoa(
                id === "g-confirm"
                  ? "Thank you for applying for the Frontend Engineer role at Orbit Labs."
                  : "We received your application.",
              ),
            },
          },
        });
      }
      if (url.includes("graph.microsoft.com"))
        return json({
          value: [
            {
              id: "m-confirm",
              subject: "Application received",
              from: { emailAddress: { address: "jobs@northstar.test" } },
              body: {
                contentType: "text",
                content:
                  "Thank you for applying for the Product Designer role at Northstar.",
              },
              receivedDateTime: new Date().toISOString(),
              webLink: "https://outlook.office.com/mail/inbox/id/fixture",
            },
          ],
          "@odata.deltaLink":
            "https://graph.microsoft.com/v1.0/synthetic-delta",
        });
      throw new Error("Unexpected synthetic test request.");
    };
  });
  await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "SYNC", force: true }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Orbit Labs Frontend Engineer/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Northstar Product Designer/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Review/ }).click();
  await page.getByLabel("Company", { exact: true }).fill("Example");
  await page.getByLabel("Role", { exact: true }).fill("QA Engineer");
  await page.getByRole("button", { name: "Accept update" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to applications" }).click();
  await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: "SYNC", force: true }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "All 5", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Review/ })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/email-tracker-1440.png",
    fullPage: true,
  });
  // Stop network ingestion before verifying a fresh worker (no credentials or mocks survive in code).
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("next-chapter", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = d.transaction("accounts", "readwrite");
    const r = tx.objectStore("accounts").getAll();
    r.onsuccess = () => {
      for (const a of r.result)
        tx.objectStore("accounts").put({
          ...a,
          connected: false,
          generation: crypto.randomUUID(),
        });
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    d.close();
  });
});
test("worker restart and full browser restart retain tracker data", async () => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  expect(
    await page.evaluate(() => chrome.runtime.sendMessage({ type: "SYNC" })),
  ).toEqual({ ok: true });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "All 5", exact: true }),
  ).toBeVisible();
  await context.close();
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 1024 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  page = await context.newPage();
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "All 5", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Acme Software Engineer/ }).click();
  await expect(page.getByLabel("Application notes")).toHaveValue(
    "Updated in first tab",
  );
  await page.getByRole("button", { name: "All applications" }).click();
});
