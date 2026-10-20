import { type Account, type Cursor, type Email } from "../domain/model";
import { request, ApiError } from "./http";
import { textFromHtml } from "../ingestion/parser";
const root = "https://gmail.googleapis.com/gmail/v1/users/me";
interface Part {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: Part[];
  headers?: { name: string; value: string }[];
}
interface Message {
  id: string;
  threadId: string;
  internalDate: string;
  payload: Part;
}
function decode(s: string) {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      ),
    );
  } catch {
    return "";
  }
}
export function gmailBody(part: Part): string {
  if (part.mimeType === "text/plain" && part.body?.data)
    return decode(part.body.data);
  const plain = (part.parts ?? [])
    .filter((p) => p.mimeType !== "text/html")
    .map(gmailBody)
    .filter(Boolean)
    .join("\n");
  if (plain) return plain;
  return part.mimeType === "text/html" && part.body?.data
    ? textFromHtml(decode(part.body.data))
    : (part.parts ?? []).map(gmailBody).filter(Boolean).join("\n");
}
export function normalizeGmail(m: Message, a: Account): Email {
  const header = (name: string) =>
    m.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  return {
    id: m.id,
    provider: "gmail",
    accountId: a.id,
    subject: header("subject"),
    from: header("from"),
    internetId: header("message-id"),
    text: gmailBody(m.payload).slice(0, 200000),
    receivedAt: new Date(Number(m.internalDate)).toISOString(),
    url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(a.label)}#all/${encodeURIComponent(m.id)}`,
  };
}
export async function gmailBatch(
  a: Account,
  c: Cursor,
  token: string,
): Promise<{ messages: Email[]; cursor: Cursor }> {
  const cursor = { ...c };
  let ids: string[] = [];
  if (cursor.pendingIds?.length) {
    ids = cursor.pendingIds;
  } else if (cursor.mode === "initial") {
    if (!cursor.watermark) {
      const p = await request<{ historyId: string }>(`${root}/profile`, token);
      cursor.watermark = p.historyId;
    }
    const url = new URL(`${root}/messages`);
    url.searchParams.set("maxResults", "5");
    url.searchParams.set(
      "q",
      `after:${Math.floor(Date.parse(cursor.since) / 1000)} (application OR interview OR assessment OR "offer letter" OR "applying")`,
    );
    if (cursor.next) url.searchParams.set("pageToken", cursor.next);
    const list = await request<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(url.href, token);
    ids = (list.messages ?? []).map((m) => m.id);
    cursor.next = list.nextPageToken;
    cursor.completeAfterPending = !cursor.next;
  } else {
    const url = new URL(`${root}/history`);
    url.searchParams.set("startHistoryId", cursor.watermark!);
    url.searchParams.set("historyTypes", "messageAdded");
    url.searchParams.set("maxResults", "20");
    if (cursor.next) url.searchParams.set("pageToken", cursor.next);
    try {
      const list = await request<{
        history?: { messagesAdded?: { message: { id: string } }[] }[];
        historyId: string;
        nextPageToken?: string;
      }>(url.href, token);
      ids = [
        ...new Set(
          (list.history ?? []).flatMap((h) =>
            (h.messagesAdded ?? []).map((m) => m.message.id),
          ),
        ),
      ];
      cursor.next = list.nextPageToken;
      cursor.completeAfterPending = !cursor.next;
      if (cursor.completeAfterPending)
        cursor.completedWatermark = list.historyId;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        return gmailBatch(
          a,
          {
            ...c,
            mode: "initial",
            next: undefined,
            watermark: undefined,
            complete: false,
          },
          token,
        );
      throw e;
    }
  }
  // A deleted message between list and get must not prevent the page checkpoint.
  const messages: Email[] = [];
  for (const id of ids.slice(0, 5)) {
    try {
      const m = await request<Message>(
        `${root}/messages/${encodeURIComponent(id)}?format=full`,
        token,
      );
      const normalized = normalizeGmail(m, a);
      if (!normalized.from.toLowerCase().includes(a.label.toLowerCase()))
        messages.push(normalized);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  cursor.pendingIds = ids.slice(5);
  cursor.complete = !cursor.pendingIds.length && !!cursor.completeAfterPending;
  if (cursor.complete) {
    cursor.mode = "incremental";
    if (cursor.completedWatermark) cursor.watermark = cursor.completedWatermark;
    delete cursor.completedWatermark;
    delete cursor.completeAfterPending;
  }
  return { messages, cursor };
}
