import { type Account, type Cursor, type Email } from "../domain/model";
import { request, ApiError } from "./http";
import { textFromHtml } from "../ingestion/parser";
interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress: { name?: string; address?: string } };
  body?: { contentType: string; content: string };
  receivedDateTime: string;
  internetMessageId?: string;
  webLink?: string;
  "@removed"?: unknown;
}
export function normalizeMicrosoft(m: GraphMessage, a: Account): Email {
  return {
    id: m.id,
    provider: "microsoft",
    accountId: a.id,
    subject: m.subject ?? "",
    from: m.from?.emailAddress.address ?? "",
    internetId: m.internetMessageId,
    text: (m.body?.contentType.toLowerCase() === "html"
      ? textFromHtml(m.body.content)
      : (m.body?.content ?? "")
    ).slice(0, 200000),
    receivedAt: new Date(m.receivedDateTime).toISOString(),
    url: m.webLink ?? "https://outlook.office.com/mail/",
  };
}
export async function microsoftBatch(
  a: Account,
  c: Cursor,
  token: string,
): Promise<{ messages: Email[]; cursor: Cursor }> {
  const initial = new URL(
    `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(c.folder)}/messages/delta`,
  );
  initial.searchParams.set(
    "$select",
    "id,subject,from,body,receivedDateTime,internetMessageId,webLink",
  );
  initial.searchParams.set("$filter", `receivedDateTime ge ${c.since}`);
  let result: {
    value: GraphMessage[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  };
  try {
    result = await request(c.next ?? initial.href, token, {
      headers: {
        Prefer:
          'IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=20',
      },
    });
  } catch (e) {
    if (e instanceof ApiError && [404, 410].includes(e.status) && c.next)
      return microsoftBatch(
        a,
        { ...c, next: undefined, mode: "initial", complete: false },
        token,
      );
    throw e;
  }
  const complete = !result["@odata.nextLink"];
  const next = result["@odata.nextLink"] ?? result["@odata.deltaLink"];
  if (!next)
    throw new Error(
      "Outlook did not return a continuation cursor. Retry sync.",
    );
  return {
    messages: result.value
      .filter((m) => !m["@removed"] && m.receivedDateTime)
      .map((m) => normalizeMicrosoft(m, a)),
    cursor: { ...c, next, complete, mode: complete ? "incremental" : c.mode },
  };
}
export async function listFolders(a: Account, token: string) {
  let url: string | undefined =
    "https://graph.microsoft.com/v1.0/me/mailFolders?$select=id,displayName,childFolderCount&$top=100";
  const folders: { id: string; displayName: string }[] = [];
  while (url) {
    const page: {
      value: { id: string; displayName: string }[];
      "@odata.nextLink"?: string;
    } = await request(url, token);
    folders.push(...page.value);
    url = page["@odata.nextLink"];
  }
  return folders;
}
