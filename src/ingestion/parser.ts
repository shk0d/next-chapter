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
    parserVersion: 2,
  };
}

const stagePatterns: [Proposal["status"], RegExp][] = [
  [
    "Rejected",
    /\b(?:we regret to inform you|regretfully|unfortunately.{0,100}\b(?:not selected|not moving forward|unable to proceed|will not proceed)|(?:not selected|not moving forward|will not be moving forward|will not proceed|decided not to proceed|moving forward with other candidates|pursue other candidates|not be progressing)|application (?:was |has been )?rejected)\b/i,
  ],
  [
    "Offer",
    /\b(?:(?:pleased|delighted|excited) to (?:offer|extend)|offer (?:you|of employment)|employment offer|offer letter|job offer|congratulations.{0,60}(?:offer|joining))\b/i,
  ],
  [
    "Interview",
    /\b(?:invite you to (?:an? )?interview|invited to interview|schedule (?:an? |your |the )?interview|interview (?:invitation|confirmation)|next round of interviews|interview time|interview availability)\b/i,
  ],
  [
    "OA",
    /\b(?:complete (?:the |an? |your )?(?:online |coding )?assessment|assessment invitation|online assessment|coding assessment|technical assessment)\b/i,
  ],
  [
    "Applied",
    /\b(?:received your application|application (?:has been |was )?(?:received|submitted)|thank you for (?:applying|your application)|thanks for applying|application confirmation)\b/i,
  ],
];

function stageIn(text: string): Proposal["status"] | undefined {
  return stagePatterns.find(([, pattern]) => pattern.test(text))?.[0];
}

function cleanEntity(value: string) {
  return value
    .replace(/\s+(?:has been|was|is|will be|and we|so we|for your application)\b[\s\S]*$/i, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\s+(?:position|role|job title)$/i, "")
    .replace(/^["'\s:,-]+|["'\s,;:.-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEntities(text: string) {
  const labeledCompany = text.match(
    /^\s*(?:company|employer)\s*:\s*([^\n,;]{2,80})/im,
  )?.[1];
  const labeledRole = text.match(
    /^\s*(?:role|position|job title)\s*:\s*([^\n;]{2,100})/im,
  )?.[1];
  if (labeledCompany && labeledRole)
    return {
      company: cleanEntity(labeledCompany),
      role: cleanEntity(labeledRole),
    };

  const patterns = [
    /(?:application|interview|assessment|offer)\s+(?:for|regarding)\s+(?:the\s+)?(?:(?:position|role)\s+(?:of\s+)?)?(.{2,100}?)\s+(?:(?:position|role)\s+)?(?:at|with)\s+([^\n.!?<>]{2,80})/i,
    /(?:applying|application)\s+(?:for|to)\s+(?:the\s+)?(?:(?:position|role)\s+(?:of\s+)?)?(.{2,100}?)\s+(?:(?:position|role)\s+)?(?:at|with)\s+([^\n.!?<>]{2,80})/i,
    /(?:applying|application)\s+to\s+([^\n,;.!?<>]{2,80}?)\s+for\s+(?:the\s+)?(.{2,100}?)(?=\s+(?:position|role)\b|[,;.!?\n]|$)/i,
    /(?:position|role)\s+(?:(?:of|as)\s+)?(.{2,100}?)\s+(?:at|with)\s+([^\n.!?<>]{2,80})/i,
    /(?:application|interview|assessment|offer)\s*[-–:|]\s*([^\n|]{2,80}?)\s+(?:at|@)\s+([^\n|.!?]{2,80})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const reversed = /(?:applying|application)\s+to/i.test(match[0]);
    const role = cleanEntity(reversed ? match[2] : match[1]);
    const company = cleanEntity(reversed ? match[1] : match[2]);
    if (company && role) return { company, role };
  }
  return { company: "", role: "" };
}

export function parseEmail(mail: Email): Proposal | undefined {
  // Job digests and promotional offers must never become applications.
  if (
    /job alert|jobs? (?:you might|for you)|recommended jobs|unsubscribe/i.test(
      mail.subject,
    )
  )
    return;

  const subject = mail.subject.replace(/\s+/g, " ").trim();
  const body = mail.text.slice(0, 5000);
  const subjectStatus = stageIn(subject);
  const bodyStatus = stageIn(body);
  const status =
    subjectStatus && subjectStatus !== "Applied"
      ? subjectStatus
      : bodyStatus && bodyStatus !== "Applied"
        ? bodyStatus
        : bodyStatus ?? subjectStatus;
  if (!status) return;

  const { company, role } = extractEntities(`${subject}\n${body}`);
  const forwarded = /forwarded message|begin forwarded|^fwd?:/im.test(
    `${subject}\n${body}`,
  );
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
