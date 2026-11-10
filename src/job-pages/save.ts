import { db, notify } from "../db/database";
import { blankApplication, normalize } from "../domain/model";
import { cleanText, jobPageUrl } from "./model";
export async function saveJobPage(value: unknown, sourceUrl: string) {
  const draft = value as Record<string, unknown> | null;
  const company = cleanText(draft?.company);
  const role = cleanText(draft?.role);
  if (!company || !role)
    throw new Error("Add both the company and role before saving.");
  const jobUrl = jobPageUrl(sourceUrl);
  const database = await db();
  const tx = database.transaction("applications", "readwrite");
  const records = await tx.store.getAll();
  const existing = records.find((a) => {
    let sameUrl = false;
    try {
      sameUrl = !!a.jobUrl && jobPageUrl(a.jobUrl) === jobUrl;
    } catch {
      /* Legacy URL may not be HTTPS. */
    }
    return (
      sameUrl ||
      (normalize(a.company) === normalize(company) &&
        normalize(a.role) === normalize(role))
    );
  });
  if (existing) {
    await tx.done;
    return { id: existing.id, status: existing.status, existing: true };
  }
  const application = {
    ...blankApplication(),
    company,
    role,
    location: cleanText(draft?.location),
    jobUrl,
    revision: 1,
    overrides: ["company", "role", "status", "jobUrl", "location"],
  };
  application.history.push({
    id: crypto.randomUUID(),
    status: "Interested",
    origin: "manual",
    at: application.createdAt,
  });
  await tx.store.add(application);
  await tx.done;
  notify();
  return { id: application.id, status: application.status, existing: false };
}
