import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
let context: BrowserContext;
let page: Page;
let profile: string;
test.beforeEach(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "next-chapter-pipeline-"));
  const extension = path.resolve("dist");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 390, height: 844 },
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  page = await context.newPage();
  await page.goto(
    `chrome-extension://${new URL(worker.url()).host}/index.html`,
  );
  await expect(
    page.getByRole("heading", { name: "Your next chapter starts here" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("next-chapter", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = d.transaction("applications", "readwrite");
    for (const status of [
      "Interested",
      "Applied",
      "OA",
      "Interview",
      "Offer",
      "Rejected",
    ]) {
      tx.objectStore("applications").put({
        id: `pipeline-${status}`,
        company: `Fixture ${status}`,
        role: "Designer",
        status,
        appliedDate: "2026-01-01",
        location: "Remote",
        jobUrl: "",
        requisitionId: "",
        recruiter: "",
        notes: "Synthetic fixture",
        action: "Follow up",
        actionDate: "2026-01-02",
        actionDone: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 1,
        history: [],
        overrides: [],
        sourceIds: [],
      });
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    d.close();
  });
  await page.reload();
  await expect(page.locator(".pipeline-card")).toHaveCount(6);
});
test.afterEach(async () => {
  await context?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});

const heading = (status: string) =>
  page.locator(`.pipeline-status-heading.status-${status.toLowerCase()}`);

test("action updates remain visible while headings unfold and reverse on a narrow screen", async () => {
  await expect(page.locator(".status-tabs")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pipeline", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pipeline-status-heading.has-update")).toHaveCount(
    3,
  );
  await expect(page.locator(".pipeline-update-badge")).toHaveCount(3);
  for (const status of ["OA", "Interview", "Offer"]) {
    const box = (await heading(status).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  const firstCard = (await page
    .locator(".pipeline-card")
    .first()
    .boundingBox())!;
  for (const status of ["OA", "Interview", "Offer"]) {
    const box = (await heading(status).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(firstCard.y);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: "test-results/pipeline-stacked-mobile.png",
    fullPage: true,
  });
  const original = await heading("Offer").boundingBox();
  // Scrub both directions in the same native scroll container.
  await page.locator(".pipeline").evaluate((node) => {
    const column = node.querySelector('[aria-label="Offer applications"]')!;
    const origin =
      column.getBoundingClientRect().left -
      node.getBoundingClientRect().left +
      node.scrollLeft;
    node.scrollLeft = origin - (node.clientWidth - 174 + 50);
  });
  await expect
    .poll(async () => (await heading("Offer").boundingBox())?.x)
    .not.toBe(original?.x);
  await page.screenshot({
    path: "test-results/pipeline-unfolding-mobile.png",
    fullPage: true,
  });
  await page.locator(".pipeline").evaluate((node) => {
    node.scrollLeft = 0;
  });
  await expect
    .poll(async () => Math.round((await heading("Offer").boundingBox())!.x))
    .toBe(Math.round(original!.x));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.screenshot({
    path: "test-results/pipeline-notifications-desktop.png",
    fullPage: true,
  });
});

test("All does not acknowledge updates; revealing a column preserves them until explicit acknowledgment", async () => {
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "All 6", exact: true }).click();
  await expect(page.locator(".status-tabs .unread-badge")).toHaveCount(3);
  await page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await heading("Offer").click();
  await expect(heading("Offer")).toHaveAttribute("data-docked", "false");
  await expect(heading("Offer").locator(".pipeline-update-badge")).toHaveCount(
    1,
  );
  await heading("Offer").click();
  await expect(heading("Offer").locator(".pipeline-update-badge")).toHaveCount(
    0,
  );
  await expect(heading("OA").locator(".pipeline-update-badge")).toHaveCount(1);
  await expect(
    heading("Interview").locator(".pipeline-update-badge"),
  ).toHaveCount(1);
  await page.reload();
  await expect(heading("Offer").locator(".pipeline-update-badge")).toHaveCount(
    0,
  );
  await expect(page.locator(".pipeline-update-badge")).toHaveCount(2);
});

test("keyboard and reduced-motion users can reveal and acknowledge every action stage", async () => {
  await heading("Offer").focus();
  await expect(heading("Offer")).toHaveAttribute("data-docked", "false");
  await expect(heading("Offer").locator(".pipeline-update-badge")).toHaveCount(
    1,
  );
  await page.keyboard.press("Enter");
  await expect(heading("Offer").locator(".pipeline-update-badge")).toHaveCount(
    0,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(heading("OA")).toHaveCSS("position", "static");
  await heading("OA").click();
  await expect(heading("OA").locator(".pipeline-update-badge")).toHaveCount(0);
  await expect(
    heading("Interview").locator(".pipeline-update-badge"),
  ).toHaveCount(1);
  await page.screenshot({
    path: "test-results/pipeline-reduced-motion.png",
    fullPage: true,
  });
});
