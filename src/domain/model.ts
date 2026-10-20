export const statuses = [
  "Interested",
  "Applied",
  "OA",
  "Interview",
  "Offer",
  "Rejected",
] as const;
export type Status = (typeof statuses)[number];
export type Provider = "gmail" | "microsoft";
export interface Activity {
  id: string;
  status: Status;
  at: string;
  origin: "manual" | "email" | "import";
  evidenceId?: string;
}
export interface Application {
  id: string;
  company: string;
  role: string;
  status: Status;
  appliedDate: string;
  location: string;
  jobUrl: string;
  requisitionId: string;
  notes: string;
  recruiter: string;
  action: string;
  actionDate: string;
  actionDone: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  history: Activity[];
  overrides: string[];
  sourceIds: string[];
}
export interface Email {
  id: string;
  provider: Provider;
  accountId: string;
  internetId?: string;
  subject: string;
  from: string;
  text: string;
  receivedAt: string;
  url: string;
}
export interface Evidence {
  id: string;
  provider: Provider;
  accountId: string;
  messageId: string;
  internetId?: string;
  subject: string;
  from: string;
  excerpt: string;
  receivedAt: string;
  url: string;
  parserVersion: number;
  matchKey?: string;
  confidence?: "high" | "review";
}
export interface Proposal {
  company: string;
  role: string;
  status: Status;
  confidence: "high" | "review";
  reason: string;
}
export interface Candidate {
  id: string;
  evidence: Evidence;
  proposal: Proposal;
  state: "pending" | "accepted" | "dismissed";
  applicationId?: string;
}
export interface Account {
  id: string;
  provider: Provider;
  label: string;
  connected: boolean;
  lookback: number;
  folders: string[];
  lastSync?: string;
  error?: string;
  retryAt?: number;
  failures?: number;
  nextFolder?: number;
  generation: string;
}
export interface Cursor {
  id: string;
  accountId: string;
  folder: string;
  mode: "initial" | "incremental";
  next?: string;
  watermark?: string;
  since: string;
  complete: boolean;
  pendingIds?: string[];
  completeAfterPending?: boolean;
  completedWatermark?: string;
}
export const now = () => new Date().toISOString();
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function blankApplication(): Application {
  const at = now();
  return {
    id: crypto.randomUUID(),
    company: "",
    role: "",
    status: "Interested",
    appliedDate: "",
    location: "",
    jobUrl: "",
    requisitionId: "",
    notes: "",
    recruiter: "",
    action: "",
    actionDate: "",
    actionDone: false,
    createdAt: at,
    updatedAt: at,
    revision: 0,
    history: [],
    overrides: [],
    sourceIds: [],
  };
}
export function safeUrl(value: string): string | undefined {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function canonicalUrl(value: string) {
  const valid = safeUrl(value);
  if (!valid) return "";
  const u = new URL(valid);
  u.hash = "";
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
  return u.href.replace(/\/$/, "");
}
export function duplicates(a: Application, b: Application) {
  return (
    a.id !== b.id &&
    ((!!a.requisitionId &&
      normalize(a.company) === normalize(b.company) &&
      a.requisitionId === b.requisitionId) ||
      (!!a.jobUrl && canonicalUrl(a.jobUrl) === canonicalUrl(b.jobUrl)) ||
      (normalize(a.company) === normalize(b.company) &&
        normalize(a.role) === normalize(b.role)))
  );
}
export function metrics(apps: Application[]) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const date = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    submitted: apps.filter(
      (a) => !!a.appliedDate || a.history.some((h) => h.status === "Applied"),
    ).length,
    interviews: apps.filter((a) =>
      a.history.some((h) => h.status === "Interview"),
    ).length,
    due: apps.filter(
      (a) =>
        !a.actionDone &&
        a.actionDate >= date(today) &&
        a.actionDate <= date(end),
    ).length,
    offers: apps.filter((a) => a.status === "Offer").length,
  };
}
export function validateApplication(a: Application) {
  if (!a || typeof a !== "object")
    throw new Error("Invalid application record.");
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
    "createdAt",
    "updatedAt",
  ] as const;
  for (const key of fields)
    if (typeof a[key] !== "string" || a[key].length > 50000)
      throw new Error(`Invalid ${key}.`);
  if (
    !a.id ||
    !a.company.trim() ||
    !a.role.trim() ||
    !statuses.includes(a.status)
  )
    throw new Error("Company, role, and a valid status are required.");
  if (a.jobUrl && !safeUrl(a.jobUrl))
    throw new Error("Job URL must start with https:// or http://.");
  for (const d of [a.appliedDate, a.actionDate])
    if (
      d &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        new Date(d + "T12:00:00Z").toISOString().slice(0, 10) !== d)
    )
      throw new Error("Invalid date.");
  if (
    ![a.createdAt, a.updatedAt].every((d) => Number.isFinite(Date.parse(d))) ||
    !Number.isInteger(a.revision) ||
    a.revision < 0 ||
    typeof a.actionDone !== "boolean"
  )
    throw new Error("Invalid record metadata.");
  if (
    !Array.isArray(a.history) ||
    !a.history.every(
      (h) =>
        h &&
        typeof h.id === "string" &&
        statuses.includes(h.status) &&
        Number.isFinite(Date.parse(h.at)) &&
        ["manual", "email", "import"].includes(h.origin),
    )
  )
    throw new Error("Invalid status history.");
  if (
    !Array.isArray(a.sourceIds) ||
    !a.sourceIds.every((s) => typeof s === "string") ||
    !Array.isArray(a.overrides) ||
    !a.overrides.every((s) => typeof s === "string")
  )
    throw new Error("Invalid record links.");
}
