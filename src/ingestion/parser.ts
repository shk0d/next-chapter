import { type Email, type Evidence, type Proposal } from "../domain/model";
export function evidenceFor(mail: Email): Evidence {
  return {
    id: `${mail.provider}:${mail.accountId}:${mail.id}`,
    provider: mail.provider,
    accountId: mail.accountId,
    messageId: mail.id,
    internetId: mail.internetId,
    subject: mail.subject.slice(0, 500),
    from: mail.from.slice(0, 500),
    excerpt: mail.text.replace(/\s+/g, " ").slice(0, 350),
    receivedAt: mail.receivedAt,
    url: mail.url,
    parserVersion: 1,
  };
}
export function parseEmail(mail: Email): Proposal | undefined {
  const text = `${mail.subject}\n${mail.text}`;
  // Job digests and promotional offers must never become applications.
  if (
    /job alert|jobs? (?:you might|for you)|recommended jobs|unsubscribe/i.test(
      mail.subject,
    )
  )
    return;
  let status: Proposal["status"] | undefined;
  if (
    /unfortunately[\s\S]{0,120}(?:not|unable)|not (?:be )?(?:moving|proceeding|selected)|other candidates|regret to inform/i.test(
      text,
    )
  )
    status = "Rejected";
  else if (
    /(?:offer (?:you|of employment)|pleased to (?:offer|extend)|employment offer|offer letter)/i.test(
      text,
    )
  )
    status = "Offer";
  else if (
    /(?:invite you to (?:an? )?interview|schedule (?:an? |your |the )?interview|interview (?:invitation|confirmation)|next round of interviews)/i.test(
      text,
    )
  )
    status = "Interview";
  else if (
    /(?:complete (?:the |an? |your )?(?:online |coding )?assessment|assessment invitation|online assessment)/i.test(
      text,
    )
  )
    status = "OA";
  else if (
    /(?:received your application|application (?:has been |was )?(?:received|submitted)|thank you for (?:applying|your application)|thanks for applying)/i.test(
      text,
    )
  )
    status = "Applied";
  if (!status) return;
  // Explicit role + company phrases; never infer the employer from an ATS sender domain.
  const patterns = [
    /(?:applying|application) (?:for|to) (?:the )?(.{2,100}?) (?:position |role )?(?:at|with) ([^\n.!?<>]{2,80})/i,
    /(?:application|interview|assessment|offer)\s*[-–:|]\s*([^\n|]{2,80}?)\s+(?:at|@)\s+([^\n|.!?]{2,80})/i,
    /(?:position|role) (?:of |as )?(.{2,100}?) (?:at|with) ([^\n.!?<>]{2,80})/i,
  ];
  let company = "",
    role = "";
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      role = m[1].replace(/\s+(?:position|role)$/i, "").trim();
      company = m[2].trim();
      break;
    }
  }
  const clean = (s: string) => s.replace(/^["'\s]+|["'\s,;:]+$/g, "");
  company = clean(company);
  role = clean(role);
  const forwarded = /forwarded message|begin forwarded|^fwd?:/im.test(text);
  const high =
    !!company &&
    !!role &&
    !forwarded &&
    !/\b(and|or)\b/i.test(role) &&
    company.length < 65 &&
    !/\b(for|we|your|and|is|has)\b/i.test(company);
  return {
    company,
    role,
    status,
    confidence: high ? "high" : "review",
    reason: high
      ? "Explicit application stage, role and company."
      : forwarded
        ? "Forwarded email: confirm the company, role and matching application."
        : "Confirm the company and role before importing.",
  };
}
export function textFromHtml(html: string) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    )
    .trim();
}
