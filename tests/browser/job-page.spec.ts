import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("job-site permissions, on-page saving, correction, duplicate protection, SPA navigation and worker restart", async () => {
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "next-chapter-job-page-"),
  );
  // Native permission bubbles are unavailable in headless Chromium. Only this
  // disposable copy pregrants the intercepted fixture origin; production dist
  // keeps every job-site origin optional. Registration and messaging remain real.
  const extension = path.join(profile, "extension");
  await fs.cp(path.resolve("dist"), extension, { recursive: true });
  const manifest = JSON.parse(
    await fs.readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions = ["https://jobs.lever.co/*"];
  await fs.writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 1024 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const tracker = await context.newPage();
    const base = `chrome-extension://${new URL(worker.url()).host}/index.html`;
    await tracker.goto(base);
    await expect(
      tracker.getByRole("heading", { name: "Applications", exact: true }),
    ).toBeVisible();
    await context.route("https://jobs.lever.co/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><head><title>Synthetic job page</title><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Product Designer", hiringOrganization: { name: "Example Labs" }, jobLocationType: "TELECOMMUTE" })}</script></head><body><h1>Product Designer</h1><p>Synthetic fixture; no application is submitted.</p></body></html>`,
      }),
    );
    const job = await context.newPage();
    const jobUrl =
      "https://jobs.lever.co/example/designer?utm_source=synthetic";
    await job.goto(jobUrl);
    await expect(job.locator("[data-next-chapter-job-button]")).toHaveCount(0);
    await tracker
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await tracker
      .getByLabel("Another job-site URL")
      .fill("https://jobs.lever.co");
    await tracker
      .getByRole("button", { name: "Enable this site", exact: true })
      .click();
    await expect(tracker.getByRole("status")).toContainText("Enabled.");
    await tracker.getByRole("button", { name: "Done", exact: true }).click();
    await job.reload();
    // A page script cannot simulate a user save with DOM-dispatched clicks.
    await job.evaluate(() =>
      document
        .querySelector("[data-next-chapter-job-button]")
        ?.shadowRoot?.querySelector<HTMLButtonElement>(".launcher")
        ?.click(),
    );
    await expect(
      job.getByRole("button", { name: "Save to Interested", exact: true }),
    ).toBeHidden();
    const rejected = await tracker.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "SAVE_JOB_PAGE",
        draft: { company: "Spoof", role: "No" },
      }),
    );
    expect(rejected.ok).toBe(false);
    await job
      .getByRole("button", { name: "+ Add to Interested", exact: true })
      .click();
    await expect(job.getByLabel("Company", { exact: true })).toHaveValue(
      "Example Labs",
    );
    await job
      .getByLabel("Role", { exact: true })
      .fill("Senior Product Designer");
    await job
      .getByRole("button", { name: "Save to Interested", exact: true })
      .click();
    await expect(job.getByRole("status")).toContainText("Saved to Interested");
    await expect(
      tracker.getByRole("button", {
        name: /Example Labs Senior Product Designer/,
      }),
    ).toBeVisible();
    await job.screenshot({
      path: "test-results/job-page-saved.png",
      fullPage: true,
    });
    // Reload/retry must not duplicate, and must preserve a corrected Interview stage.
    await tracker
      .getByRole("button", { name: /Example Labs Senior Product Designer/ })
      .click();
    await tracker.getByRole("button", { name: "Edit application" }).click();
    await tracker
      .getByLabel("Status", { exact: true })
      .selectOption("Interview");
    await tracker
      .getByLabel("Application notes")
      .fill("Manual notes survive capture retries.");
    await tracker
      .getByRole("button", { name: "Save application", exact: true })
      .click();
    const cdp = await context.newCDPSession(tracker);
    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.stopAllWorkers");
    await job.reload();
    await job
      .getByRole("button", { name: "+ Add to Interested", exact: true })
      .click();
    await job
      .getByRole("button", { name: "Save to Interested", exact: true })
      .click();
    await expect(job.getByRole("status")).toContainText(
      "Already tracked · Interview",
    );
    await tracker.reload();
    await expect(tracker.locator(".pipeline-card")).toHaveCount(1);
    await tracker
      .getByRole("button", { name: /Example Labs Senior Product Designer/ })
      .click();
    await expect(tracker.getByLabel("Application notes")).toHaveValue(
      "Manual notes survive capture retries.",
    );
    await expect(tracker.getByLabel("Job URL", { exact: true })).toHaveValue(
      "https://jobs.lever.co/example/designer",
    );
    // Client-side navigation to a listing clears stale UI; a later detail can be captured.
    await job.evaluate(() => {
      document.querySelector('script[type="application/ld+json"]')?.remove();
      history.pushState({}, "", "/example");
      document.body.innerHTML = "<h1>Open roles</h1>";
    });
    await expect(job.locator("[data-next-chapter-job-button]")).toHaveCount(0);
    await job.goto(jobUrl);
    await expect(
      job.getByRole("button", { name: "+ Add to Interested", exact: true }),
    ).toBeVisible();
    await tracker
      .getByRole("button", { name: "All applications", exact: true })
      .click();
    await tracker
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await tracker
      .locator(".job-site-list li")
      .filter({ hasText: "jobs.lever.co" })
      .getByRole("button", { name: "Disable" })
      .click();
    await expect(job.locator("[data-next-chapter-job-button]")).toHaveCount(0);
    await job.reload();
    await expect(job.locator("[data-next-chapter-job-button]")).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});
