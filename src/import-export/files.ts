import Papa from "papaparse";
import {
  blankApplication,
  duplicates,
  now,
  statuses,
  validateApplication,
  type Application,
} from "../domain/model";
import { db, notify } from "../db/database";
const fields = [
  "id",
  "company",
  "role",
  "status",
  "appliedDate",
  "location",
  "jobUrl",
  "requisitionId",
  "notes",
  "recruiter",
  "action",
  "actionDate",
  "actionDone",
] as const;
export function toCsv(apps: Application[]) {
  return Papa.unparse(
    { fields: [...fields], data: apps.map((a) => fields.map((k) => a[k])) },
    { escapeFormulae: /^[=+\-@\t\r\n\uFEFF]/ },
  );
}
export function readCsv(text: string, mapping: Record<string, string> = {}) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (s) => s.trim().replace(/^\uFEFF/, ""),
  });
  const errors = parsed.errors.map(
    (e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`,
  );
  const apps: Application[] = [];
  parsed.data.forEach((row, index) => {
    try {
      const a = blankApplication();
      for (const k of fields) {
        const value = row[mapping[k] ?? k];
        if (value !== undefined) {
          if (k === "actionDone") a.actionDone = value.toLowerCase() === "true";
          else if (k === "status") {
            const status = statuses.find(
              (s) => s.toLowerCase() === value.trim().toLowerCase(),
            );
            if (!status) throw new Error("Unknown status.");
            a.status = status;
          } else a[k] = value;
        }
      }
      if (!a.history.length)
        a.history = [
          {
            id: crypto.randomUUID(),
            status: a.status,
            at: now(),
            origin: "import",
          },
        ];
      validateApplication(a);
      apps.push(a);
    } catch (e) {
      errors.push(`Row ${index + 2}: ${(e as Error).message}`);
    }
  });
  if (new Set(apps.map((a) => a.id)).size !== apps.length)
    errors.push(
      "The file contains repeated IDs. Give each application a unique ID.",
    );
  return { apps, errors, headers: parsed.meta.fields ?? [] };
}
export async function importApplications(
  apps: Application[],
  mode: "skip" | "separate",
) {
  apps.forEach(validateApplication);
  const d = await db();
  const tx = d.transaction("applications", "readwrite");
  const existing = await tx.store.getAll();
  let count = 0;
  for (const incoming of apps) {
    const same = existing.some(
      (a) => a.id === incoming.id || duplicates(a, incoming),
    );
    if (same && mode === "skip") continue;
    const a = {
      ...incoming,
      id: same ? crypto.randomUUID() : incoming.id,
      revision: 1,
      sourceIds: [],
      overrides: [
        "company",
        "role",
        "status",
        "appliedDate",
        "action",
        "actionDate",
      ],
    };
    await tx.store.put(a);
    existing.push(a);
    count++;
  }
  await tx.done;
  notify();
  return count;
}
export async function backupText() {
  const d = await db();
  const tx = d.transaction(
    ["applications", "evidence", "candidates", "tombstones"],
    "readonly",
  );
  const [applications, evidence, candidates, tombstones] = await Promise.all([
    tx.objectStore("applications").getAll(),
    tx.objectStore("evidence").getAll(),
    tx.objectStore("candidates").getAll(),
    tx.objectStore("tombstones").getAll(),
  ]);
  await tx.done;
  return JSON.stringify(
    {
      format: "next-chapter",
      version: 1,
      exportedAt: now(),
      applications,
      evidence,
      candidates,
      tombstones,
    },
    null,
    2,
  );
}
export function validateBackup(text: string) {
  const data = JSON.parse(text);
  if (
    data.format !== "next-chapter" ||
    data.version !== 1 ||
    !["applications", "evidence", "candidates", "tombstones"].every((k) =>
      Array.isArray(data[k]),
    )
  )
    throw new Error("Not a supported Next Chapter backup.");
  if (data.applications.length > 100000)
    throw new Error("Backup is too large.");
  data.applications.forEach(validateApplication);
  const validEvidence = (e: any) =>
    e &&
    typeof e.id === "string" &&
    ["gmail", "microsoft"].includes(e.provider) &&
    [
      "accountId",
      "messageId",
      "subject",
      "from",
      "excerpt",
      "receivedAt",
      "url",
    ].every((k) => typeof e[k] === "string") &&
    Number.isFinite(Date.parse(e.receivedAt)) &&
    /^https:\/\//.test(e.url) &&
    typeof e.parserVersion === "number";
  if (
    !data.evidence.every(validEvidence) ||
    !data.candidates.every(
      (c: any) =>
        c &&
        typeof c.id === "string" &&
        validEvidence(c.evidence) &&
        ["pending", "accepted", "dismissed"].includes(c.state) &&
        c.proposal &&
        typeof c.proposal.company === "string" &&
        typeof c.proposal.role === "string" &&
        typeof c.proposal.reason === "string" &&
        statuses.includes(c.proposal.status) &&
        ["high", "review"].includes(c.proposal.confidence),
    ) ||
    !data.tombstones.every(
      (t: any) =>
        t &&
        typeof t.id === "string" &&
        typeof t.deletedAt === "string" &&
        Array.isArray(t.sourceIds) &&
        t.sourceIds.every((s: any) => typeof s === "string"),
    )
  )
    throw new Error(
      "Backup contains invalid evidence, review records, or deletion history.",
    );
  for (const key of ["applications", "evidence", "candidates", "tombstones"])
    if (new Set(data[key].map((r: any) => r.id)).size !== data[key].length)
      throw new Error("Backup contains repeated IDs.");
  return data as {
    applications: Application[];
    evidence: import("../domain/model").Evidence[];
    candidates: import("../domain/model").Candidate[];
    tombstones: { id: string; sourceIds: string[]; deletedAt: string }[];
  };
}
export async function restoreBackup(text: string, mode: "merge" | "replace") {
  const data = validateBackup(text);
  const d = await db();
  const tx = d.transaction(
    [
      "applications",
      "evidence",
      "candidates",
      "tombstones",
      "accounts",
      "cursors",
      "locks",
    ],
    "readwrite",
  );
  // Invalidate all sync sessions so in-flight batches cannot restore overwritten state.
  const previousApplications = await tx.objectStore("applications").getAll();
  for (const a of await tx.objectStore("accounts").getAll())
    await tx
      .objectStore("accounts")
      .put({ ...a, connected: false, generation: crypto.randomUUID() });
  await tx.objectStore("cursors").clear();
  await tx.objectStore("locks").clear();
  for (const key of [
    "applications",
    "evidence",
    "candidates",
    "tombstones",
  ] as const) {
    const store = tx.objectStore(key);
    if (mode === "replace") await store.clear();
    for (const record of data[key]) {
      if (mode === "merge" && (await store.get(record.id))) continue;
      if (key === "applications" && mode === "replace") {
        // Invalidate edits opened before restore, even if the backup reused an old revision.
        const prior = previousApplications.find((a) => a.id === record.id);
        await tx.objectStore("applications").put({
          ...(record as Application),
          revision:
            Math.max((record as Application).revision, prior?.revision ?? 0) +
            1,
        });
      } else await store.put(record as never);
    }
  }
  await tx.done;
  notify();
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
