export interface JobDraft {
  company: string;
  role: string;
  location: string;
}
export const captureScriptId = "next-chapter-job-pages";
export const captureSettingsKey = "jobPageOrigins";
export const starterJobOrigins = [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://apply.workable.com/*",
  "https://*.myworkdayjobs.com/*",
  "https://jobs.smartrecruiters.com/*",
];
export function cleanText(value: unknown, limit = 200): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit)
    : "";
}
export function jobPageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Use an HTTPS job page without embedded credentials.");
  url.hash = "";
  // Keep job identifiers; application/session tokens and personal queries never enter storage.
  for (const key of [...url.searchParams.keys()]) {
    if (!/^(gh_jid|jobid|currentjobid|jid|jk|reqid|requisitionid)$/i.test(key))
      url.searchParams.delete(key);
  }
  return url.href;
}
export function sitePattern(value: string) {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".")
  )
    throw new Error(
      "Enter an HTTPS job-site URL, such as https://jobs.example.com.",
    );
  return `${url.origin}/*`;
}
export function structuredJob(
  values: unknown[],
  pageUrl: string,
): JobDraft | undefined {
  const jobs: Record<string, unknown>[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 100)) visit(child, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    const types = Array.isArray(node["@type"])
      ? node["@type"]
      : [node["@type"]];
    if (types.includes("JobPosting")) jobs.push(node);
    if (node["@graph"]) visit(node["@graph"], depth + 1);
    if (node.mainEntity) visit(node.mainEntity, depth + 1);
  };
  values.forEach((v) => visit(v));
  let job =
    jobs.length === 1
      ? jobs[0]
      : jobs.find((node) => {
          try {
            return (
              jobPageUrl(new URL(String(node.url), pageUrl).href) ===
              jobPageUrl(pageUrl)
            );
          } catch {
            return false;
          }
        });
  if (!job) return;
  const organization = job.hiringOrganization as
    Record<string, unknown> | undefined;
  const places = Array.isArray(job.jobLocation)
    ? job.jobLocation
    : [job.jobLocation];
  const location = places
    .map((place) => {
      const address = (place as { address?: Record<string, unknown> })?.address;
      return address
        ? [
            address.addressLocality,
            address.addressRegion,
            address.addressCountry,
          ]
            .map((v) => cleanText(v))
            .filter(Boolean)
            .join(", ")
        : "";
    })
    .filter(Boolean)
    .join(" · ");
  const role = cleanText(job.title);
  return role
    ? {
        role,
        company: cleanText(organization?.name),
        location: cleanText(
          job.jobLocationType === "TELECOMMUTE" && !location
            ? "Remote"
            : location,
        ),
      }
    : undefined;
}
