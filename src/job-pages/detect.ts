import { cleanText, structuredJob, type JobDraft } from "./model";
export function detectJobPage(
  document: Document,
  url: string,
): JobDraft | undefined {
  const structured: unknown[] = [];
  for (const node of [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].slice(0, 30)) {
    if ((node.textContent?.length ?? 0) > 500_000) continue;
    try {
      structured.push(JSON.parse(node.textContent || ""));
    } catch {
      /* Malformed publisher metadata. */
    }
  }
  const job = structuredJob(structured, url);
  if (job) return job;
  const parsed = new URL(url);
  const host = parsed.hostname;
  const path = parsed.pathname;
  const atsDetail =
    (/^(job-boards\.|boards\.)greenhouse\.io$/.test(host) &&
      (/\/jobs\/\d+/.test(path) || parsed.searchParams.has("gh_jid"))) ||
    (host === "jobs.lever.co" && /^\/[^/]+\/[^/]+/.test(path)) ||
    (host === "jobs.ashbyhq.com" && /^\/[^/]+\/[^/]+/.test(path)) ||
    (host.endsWith(".myworkdayjobs.com") && /\/job\//i.test(path)) ||
    (host === "apply.workable.com" && /\/j\//.test(path)) ||
    (host === "jobs.smartrecruiters.com" && /^\/[^/]+\/[^/]+/.test(path));
  if (!atsDetail) return;
  const text = (selectors: string) =>
    cleanText(document.querySelector(selectors)?.textContent);
  const role = text(
    '[data-automation-id="jobPostingHeader"], .posting-headline h2, h1.app-title, h1',
  );
  if (!role) return;
  const company = text('.company-name, .company, [data-testid="company-name"]');
  const location = text(
    '[data-automation-id="locations"], .posting-categories .location, .location',
  );
  // Unknown employer stays empty: never mistake an ATS vendor or URL slug for the employer.
  return { company, role, location };
}
