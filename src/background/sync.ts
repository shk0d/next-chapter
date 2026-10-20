import { acquireLock, db, notify, releaseLock } from "../db/database";
import { type Cursor } from "../domain/model";
import { accountToken, googleToken, isExtension } from "../integrations/auth";
import { gmailBatch } from "../integrations/gmail";
import { microsoftBatch } from "../integrations/microsoft";
import { commitMailBatch } from "../ingestion/ingest";
import { ApiError } from "../integrations/http";
export async function syncAccount(id: string) {
  const owner = crypto.randomUUID();
  let generation: string | undefined;
  if (!(await acquireLock(id, owner))) return { more: false };
  try {
    const d = await db();
    const a = await d.get("accounts", id);
    if (!a?.connected || (a.retryAt ?? 0) > Date.now()) return { more: false };
    generation = a.generation;
    const token = await accountToken(a);
    const folders = a.provider === "gmail" ? ["mailbox"] : a.folders;
    const folderIndex = (a.nextFolder ?? 0) % folders.length;
    const folder = folders[folderIndex];
    if (!folder) throw new Error("Select at least one mail folder.");
    const cursorId = `${id}:${folder}`;
    const old = await d.get("cursors", cursorId);
    const c: Cursor = old ?? {
      id: cursorId,
      accountId: id,
      folder,
      mode: "initial",
      since: new Date(Date.now() - a.lookback * 86400000).toISOString(),
      complete: false,
    };
    const result = await (a.provider === "gmail"
      ? gmailBatch(a, { ...c, complete: false }, token)
      : microsoftBatch(a, { ...c, complete: false }, token));
    await commitMailBatch(
      id,
      a.generation,
      result.messages,
      result.cursor,
      owner,
    );
    // One folder/page per invocation. The durable pointer resumes the round after suspension.
    return {
      more: !result.cursor.complete || folderIndex + 1 < folders.length,
    };
  } catch (e) {
    const d = await db();
    const a = await d.get("accounts", id);
    if (e instanceof ApiError && e.status === 401 && a?.provider === "gmail") {
      try {
        const token = await googleToken();
        await chrome.identity.removeCachedAuthToken({ token });
      } catch {
        /* reconnect offered */
      }
    }
    if (a?.connected && a.generation === generation)
      await d.put("accounts", {
        ...a,
        error: e instanceof Error ? e.message : "Email sync failed.",
        retryAt:
          e instanceof ApiError && e.retryAt
            ? e.retryAt
            : Date.now() +
              Math.min(3_600_000, 60_000 * 2 ** Math.min(a.failures ?? 0, 6)),
        failures: (a.failures ?? 0) + 1,
      });
    notify();
    return { more: false };
  } finally {
    await releaseLock(id, owner);
  }
}
export async function requestSync(force = false) {
  if (!isExtension()) return;
  return chrome.runtime.sendMessage({ type: "SYNC", force });
}
