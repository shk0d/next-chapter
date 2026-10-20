import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  blankApplication,
  metrics,
  type Account,
  type Cursor,
  type Email,
} from "../src/domain/model";
import {
  db,
  saveApplication,
  snapshot,
  acquireLock,
  removeApplication,
  disconnectAccount,
} from "../src/db/database";
import { parseEmail, textFromHtml } from "../src/ingestion/parser";
import { commitMailBatch, resolveCandidate } from "../src/ingestion/ingest";
import {
  readCsv,
  toCsv,
  backupText,
  restoreBackup,
} from "../src/import-export/files";
import {
  gmailBatch,
  gmailBody,
  normalizeGmail,
} from "../src/integrations/gmail";
import { microsoftBatch } from "../src/integrations/microsoft";
import { request, ApiError } from "../src/integrations/http";
import { vi, afterEach } from "vitest";
const account: Account = {
  id: "gmail:test",
  provider: "gmail",
  label: "test@example.test",
  lookback: 90,
  folders: ["mailbox"],
  generation: "g",
  connected: true,
};
const cursor: Cursor = {
  id: "gmail:test:mailbox",
  accountId: account.id,
  folder: "mailbox",
  mode: "initial",
  since: "2026-01-01T00:00:00Z",
  complete: true,
};
const mail = (
  id = "one",
  text = "Thank you for applying for the Software Engineer role at Acme.",
): Email => ({
  id,
  provider: "gmail",
  accountId: account.id,
  subject: "Application received",
  from: "careers@acme.test",
  text,
  receivedAt: "2026-10-01T12:00:00Z",
  url: "https://mail.google.com/mail/#all/one",
});
beforeEach(async () => {
  const d = await db();
  for (const name of d.objectStoreNames) await d.clear(name);
  await d.put("accounts", account);
  await acquireLock(account.id, "owner");
});
afterEach(() => vi.restoreAllMocks());
describe("parsing and provider normalization", () => {
  it("detects explicit company, role and stages without guessing sender domains", () => {
    expect(parseEmail(mail())).toMatchObject({
      company: "Acme",
      role: "Software Engineer",
      status: "Applied",
      confidence: "high",
    });
    expect(
      parseEmail(
        mail(
          "x",
          "Unfortunately we are not moving forward with your application for Software Engineer at Acme.",
        ),
      )?.status,
    ).toBe("Rejected");
    expect(
      parseEmail(
        mail(
          "x",
          "Schedule your interview for the position Software Engineer at Acme.",
        ),
      )?.status,
    ).toBe("Interview");
    expect(
      parseEmail(
        mail(
          "x",
          "We are pleased to offer you the position of Software Engineer at Acme.",
        ),
      )?.status,
    ).toBe("Offer");
  });
  it("ignores job digests and routes ambiguous or forwarded messages to review", () => {
    expect(
      parseEmail({
        ...mail(),
        subject: "Job alert: application opportunities",
      }),
    ).toBeUndefined();
    expect(
      parseEmail(mail("x", "We received your application."))?.confidence,
    ).toBe("review");
    expect(
      parseEmail({ ...mail(), subject: "Fwd: Application received" })
        ?.confidence,
    ).toBe("review");
    expect(
      parseEmail({
        ...mail("x", "We have an offer on our career coaching products."),
        subject: "Special offer",
      }),
    ).toBeUndefined();
  });
  it("extracts UTF-8 MIME text and strips HTML without executing content", () => {
    const encoded = btoa(
      String.fromCharCode(...new TextEncoder().encode("Hello José")),
    );
    expect(
      gmailBody({
        parts: [{ mimeType: "text/plain", body: { data: encoded } }],
      }),
    ).toBe("Hello José");
    expect(textFromHtml("<script>bad()</script><p>Acme &amp; Co</p>")).toBe(
      "Acme & Co",
    );
  });
});
describe("durability, sync, review, and corrections", () => {
  it("commits cursor and record together and resync is idempotent", async () => {
    await commitMailBatch(account.id, "g", [mail()], cursor, "owner");
    await commitMailBatch(account.id, "g", [mail()], cursor, "owner");
    const s = await snapshot();
    expect(s.applications).toHaveLength(1);
    expect(s.evidence).toHaveLength(1);
    expect(s.applications[0].history).toHaveLength(1);
    expect(await (await db()).get("cursors", cursor.id)).toEqual(cursor);
  });
  it("preserves manual status and queues later conflicts", async () => {
    await commitMailBatch(account.id, "g", [mail()], cursor, "owner");
    const a = (await snapshot()).applications[0];
    await saveApplication({ ...a, status: "Interview" });
    await commitMailBatch(
      account.id,
      "g",
      [
        mail(
          "reject",
          "Unfortunately we are not moving forward with your application for Software Engineer at Acme.",
        ),
      ],
      cursor,
      "owner",
    );
    const s = await snapshot();
    expect(s.applications[0].status).toBe("Interview");
    expect(s.candidates[0].state).toBe("pending");
    expect(metrics(s.applications).interviews).toBe(1);
  });
  it("does not let older mail regress status", async () => {
    await commitMailBatch(
      account.id,
      "g",
      [
        {
          ...mail(
            "interview",
            "We invite you to an interview for the position Software Engineer at Acme.",
          ),
          receivedAt: "2026-10-05T12:00:00Z",
        },
        mail(),
      ],
      cursor,
      "owner",
    );
    const s = await snapshot();
    expect(s.applications[0].status).toBe("Interview");
    expect(s.candidates).toHaveLength(1);
  });
  it("matches original email evidence after company and role corrections", async () => {
    await commitMailBatch(account.id, "g", [mail()], cursor, "owner");
    const a = (await snapshot()).applications[0];
    await saveApplication({
      ...a,
      company: "Acme Incorporated",
      role: "Software Engineer II",
      notes: "Keep my notes",
    });
    await commitMailBatch(
      account.id,
      "g",
      [{ ...mail("new"), receivedAt: "2026-10-06T12:00:00Z" }],
      cursor,
      "owner",
    );
    const s = await snapshot();
    expect(s.applications).toHaveLength(1);
    expect(s.applications[0]).toMatchObject({
      company: "Acme Incorporated",
      role: "Software Engineer II",
      notes: "Keep my notes",
    });
    expect(s.applications[0].sourceIds).toHaveLength(2);
  });
  it("blocks stale revisions across tabs while preserving independent records", async () => {
    const a = { ...blankApplication(), company: "Acme", role: "Engineer" };
    const b = { ...blankApplication(), company: "Beta", role: "Designer" };
    await Promise.all([saveApplication(a), saveApplication(b)]);
    const stored = (await snapshot()).applications.find((x) => x.id === a.id)!;
    await saveApplication({ ...stored, notes: "First tab" });
    await expect(
      saveApplication({ ...stored, notes: "Stale tab" }),
    ).rejects.toThrow("another tab");
    expect((await snapshot()).applications).toHaveLength(2);
  });
  it("deletion prevents silent recreation from new mail", async () => {
    await commitMailBatch(account.id, "g", [mail()], cursor, "owner");
    await removeApplication((await snapshot()).applications[0]);
    await commitMailBatch(
      account.id,
      "g",
      [mail(), mail("new")],
      cursor,
      "owner",
    );
    const s = await snapshot();
    expect(s.applications).toHaveLength(0);
    expect(s.candidates).toHaveLength(1);
    expect(s.candidates[0].proposal.reason).toMatch(/deleted/);
  });
  it("review acceptance and dismissal survive reprocessing", async () => {
    await commitMailBatch(
      account.id,
      "g",
      [mail("unclear", "We received your application.")],
      cursor,
      "owner",
    );
    const c = (await snapshot()).candidates[0];
    await resolveCandidate(c, "accept", {
      company: "Acme",
      role: "Engineer",
      status: "Applied",
    });
    await expect(resolveCandidate(c, "dismiss")).rejects.toThrow(
      "already reviewed",
    );
    await commitMailBatch(
      account.id,
      "g",
      [mail("unclear", "We received your application.")],
      cursor,
      "owner",
    );
    expect((await snapshot()).applications).toHaveLength(1);
    expect((await snapshot()).candidates[0].state).toBe("accepted");
  });
  it("rejects in-flight commits after disconnect and does not checkpoint", async () => {
    await disconnectAccount(account.id);
    await expect(
      commitMailBatch(account.id, "g", [mail()], cursor, "owner"),
    ).rejects.toThrow("stopped");
    expect((await snapshot()).applications).toHaveLength(0);
    expect(await (await db()).get("cursors", cursor.id)).toBeUndefined();
  });
  it("leases reject overlapping sync and survive independent owners", async () => {
    expect(await acquireLock(account.id, "another")).toBe(false);
  });
});
describe("portable data", () => {
  it("roundtrips quoted CSV and escapes spreadsheet formulas", () => {
    const a = {
      ...blankApplication(),
      company: "Acme, Inc",
      role: "Engineer",
      notes: 'He said "hello"\nNext line',
    };
    const parsed = readCsv(toCsv([a]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.apps[0].notes).toBe(a.notes);
    expect(toCsv([{ ...a, notes: '=IMPORTXML("bad")' }])).toContain(
      "'=IMPORTXML",
    );
  });
  it("validates whole CSV before import and supports field mapping", () => {
    expect(
      readCsv("company,role,status\nAcme,Engineer,Bogus").errors,
    ).toHaveLength(1);
    const parsed = readCsv("Employer,Position\nAcme,Engineer", {
      company: "Employer",
      role: "Position",
    });
    expect(parsed.apps[0].company).toBe("Acme");
  });
  it("preserves history on backup restore and excludes auth state", async () => {
    await commitMailBatch(account.id, "g", [mail()], cursor, "owner");
    const text = await backupText();
    expect(text).not.toContain("generation");
    expect(text).not.toContain("refresh_token");
    const a = (await snapshot()).applications[0];
    await removeApplication(a);
    await restoreBackup(text, "replace");
    expect((await snapshot()).applications[0].history).toHaveLength(1);
    expect((await snapshot()).accounts[0].connected).toBe(false);
  });
  it("rejects malformed backup atomically", async () => {
    await saveApplication({
      ...blankApplication(),
      company: "Acme",
      role: "Engineer",
    });
    const bad = JSON.parse(await backupText());
    bad.applications.push({ id: "bad" });
    await expect(
      restoreBackup(JSON.stringify(bad), "replace"),
    ).rejects.toThrow();
    expect((await snapshot()).applications).toHaveLength(1);
  });
});
describe("API paging and failures", () => {
  const json = (body: unknown, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  it("Gmail initial scan snapshots history before paging and preserves its watermark", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ historyId: "100" }))
      .mockResolvedValueOnce(json({ messages: [], nextPageToken: "page2" }));
    const result = await gmailBatch(
      account,
      { ...cursor, complete: false },
      "token",
    );
    expect(result.cursor.next).toBe("page2");
    expect(result.cursor.watermark).toBe("100");
    expect(result.cursor.complete).toBe(false);
    expect(fetcher.mock.calls[1][0]).toContain("after%3A");
  });
  it("expired Gmail history cursor recovers with bounded rescan", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ historyId: "200" }))
      .mockResolvedValueOnce(json({ messages: [] }));
    const r = await gmailBatch(
      account,
      { ...cursor, mode: "incremental", watermark: "old" },
      "token",
    );
    expect(r.cursor.watermark).toBe("200");
    expect(r.cursor.complete).toBe(true);
  });
  it("Outlook delta uses per-folder cursor and follows opaque links", async () => {
    const next = "https://graph.microsoft.com/v1.0/opaque?cursor=secret";
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ value: [], "@odata.deltaLink": next }));
    const r = await microsoftBatch(
      { ...account, provider: "microsoft" },
      { ...cursor, folder: "inbox", next },
      "token",
    );
    expect(spy.mock.calls[0][0]).toBe(next);
    expect(r.cursor.complete).toBe(true);
    expect(r.cursor.next).toBe(next);
  });
  it("resumes a large Gmail history page without advancing its watermark early", async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `m${i}`);
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/history?"))
          return json({
            history: [
              { messagesAdded: ids.map((id) => ({ message: { id } })) },
            ],
            historyId: "200",
          });
        const id = new URL(url).pathname.split("/").pop()!;
        return json({
          id,
          internalDate: String(Date.parse("2026-10-01T12:00:00Z")),
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "from", value: "recruiter@acme.test" },
              { name: "subject", value: "Application received" },
            ],
            body: { data: btoa("We received your application.") },
          },
        });
      });
    const first = await gmailBatch(
      account,
      { ...cursor, mode: "incremental", watermark: "100" },
      "token",
    );
    expect(first.messages).toHaveLength(5);
    expect(first.cursor.pendingIds).toHaveLength(2);
    expect(first.cursor.watermark).toBe("100");
    expect(first.cursor.complete).toBe(false);
    const second = await gmailBatch(account, first.cursor, "token");
    expect(second.messages).toHaveLength(2);
    expect(second.cursor.watermark).toBe("200");
    expect(second.cursor.complete).toBe(true);
    expect(
      spy.mock.calls.filter((c) => String(c[0]).includes("/history?")),
    ).toHaveLength(1);
  });
  it("keeps Outlook folder rounds durable without declaring a partial round complete", async () => {
    const ms: Account = {
      ...account,
      id: "microsoft:test",
      provider: "microsoft",
      folders: ["inbox", "careers"],
    };
    const d = await db();
    await d.put("accounts", ms);
    await acquireLock(ms.id, "ms-owner");
    const first = {
      ...cursor,
      id: "ms:inbox",
      accountId: ms.id,
      folder: "inbox",
    };
    await commitMailBatch(ms.id, "g", [], first, "ms-owner");
    expect((await d.get("accounts", ms.id))?.nextFolder).toBe(1);
    expect((await d.get("accounts", ms.id))?.lastSync).toBeUndefined();
    await commitMailBatch(
      ms.id,
      "g",
      [],
      { ...first, id: "ms:careers", folder: "careers" },
      "ms-owner",
    );
    expect((await d.get("accounts", ms.id))?.nextFolder).toBe(0);
    expect((await d.get("accounts", ms.id))?.lastSync).toBeTruthy();
  });
  it("does not leak auth to foreign continuation URLs", async () => {
    await expect(request("https://evil.test/mail", "token")).rejects.toThrow(
      "Unexpected",
    );
  });
  it("honors retry-after on rate limits and reports denied consent", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({}, 429, { "Retry-After": "120" }))
      .mockResolvedValueOnce(json({}, 403));
    const start = Date.now();
    try {
      await request("https://graph.microsoft.com/v1.0/me", "token");
      expect.fail();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).retryAt).toBeGreaterThanOrEqual(start + 120000);
    }
    await expect(
      request("https://graph.microsoft.com/v1.0/me", "token"),
    ).rejects.toThrow("permission denied");
  });
});
