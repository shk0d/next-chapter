import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  type Application,
  type Candidate,
  type Evidence,
  type Account,
  type Cursor,
  now,
  validateApplication,
  normalize,
} from "../domain/model";
interface Schema extends DBSchema {
  applications: { key: string; value: Application };
  evidence: { key: string; value: Evidence };
  candidates: { key: string; value: Candidate };
  accounts: { key: string; value: Account };
  cursors: { key: string; value: Cursor };
  tombstones: {
    key: string;
    value: {
      id: string;
      sourceIds: string[];
      deletedAt: string;
      matchKey?: string;
    };
  };
  locks: { key: string; value: { id: string; owner: string; until: number } };
}
let connection: Promise<IDBPDatabase<Schema>> | undefined;
export const db = () =>
  (connection ??= openDB<Schema>("next-chapter", 1, {
    upgrade(d) {
      for (const name of [
        "applications",
        "evidence",
        "candidates",
        "accounts",
        "cursors",
        "tombstones",
        "locks",
      ] as const)
        d.createObjectStore(name, { keyPath: "id" });
    },
    blocking(_current, _next, event) {
      (event.target as IDBDatabase).close();
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("next-chapter-changes")
    : undefined;
export function notify() {
  channel?.postMessage("change");
  globalThis.dispatchEvent?.(new Event("tracker-change"));
}
export function subscribe(fn: () => void) {
  channel?.addEventListener("message", fn);
  globalThis.addEventListener?.("tracker-change", fn);
  return () => {
    channel?.removeEventListener("message", fn);
    globalThis.removeEventListener?.("tracker-change", fn);
  };
}
export async function snapshot() {
  const d = await db();
  const tx = d.transaction(
    ["applications", "candidates", "accounts", "evidence"],
    "readonly",
  );
  const [applications, candidates, accounts, evidence] = await Promise.all([
    tx.objectStore("applications").getAll(),
    tx.objectStore("candidates").getAll(),
    tx.objectStore("accounts").getAll(),
    tx.objectStore("evidence").getAll(),
  ]);
  await tx.done;
  return { applications, candidates, accounts, evidence };
}
export async function saveApplication(
  a: Application,
  origin: "manual" | "import" = "manual",
) {
  validateApplication(a);
  const d = await db();
  const tx = d.transaction("applications", "readwrite");
  const old = await tx.store.get(a.id);
  if ((old?.revision ?? 0) !== a.revision) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(
      "This application changed in another tab. Close and reopen it before saving.",
    );
  }
  const history = [...(old?.history ?? a.history)];
  if (!old || old.status !== a.status)
    history.push({
      id: crypto.randomUUID(),
      status: a.status,
      at: now(),
      origin,
    });
  const overrides =
    origin === "manual"
      ? [
          ...new Set([
            ...(old?.overrides ?? []),
            ...[
              "company",
              "role",
              "status",
              "appliedDate",
              "action",
              "actionDate",
            ].filter(
              (k) =>
                !old ||
                old[k as keyof Application] !== a[k as keyof Application],
            ),
          ]),
        ]
      : a.overrides;
  await tx.store.put({
    ...a,
    company: a.company.trim(),
    role: a.role.trim(),
    history,
    overrides,
    updatedAt: now(),
    revision: a.revision + 1,
  });
  await tx.done;
  notify();
}
export async function removeApplication(a: Application) {
  const d = await db();
  const tx = d.transaction(["applications", "tombstones"], "readwrite");
  const current = await tx.objectStore("applications").get(a.id);
  if (!current || current.revision !== a.revision) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Application changed. Reopen it before deleting.");
  }
  await tx.objectStore("tombstones").put({
    id: a.id,
    sourceIds: a.sourceIds,
    deletedAt: now(),
    matchKey: `${normalize(current.company)}:${normalize(current.role)}`,
  });
  await tx.objectStore("applications").delete(a.id);
  await tx.done;
  notify();
}
export async function acquireLock(id: string, owner: string, ttl = 180_000) {
  const d = await db();
  const tx = d.transaction("locks", "readwrite");
  const old = await tx.store.get(id);
  if (old && old.until > Date.now()) {
    await tx.done;
    return false;
  }
  await tx.store.put({ id, owner, until: Date.now() + ttl });
  await tx.done;
  return true;
}
export async function releaseLock(id: string, owner: string) {
  const d = await db();
  const tx = d.transaction("locks", "readwrite");
  if ((await tx.store.get(id))?.owner === owner) await tx.store.delete(id);
  await tx.done;
}
export async function disconnectAccount(id: string) {
  const d = await db();
  const tx = d.transaction(["accounts", "cursors"], "readwrite");
  const a = await tx.objectStore("accounts").get(id);
  if (a)
    await tx.objectStore("accounts").put({
      ...a,
      connected: false,
      generation: crypto.randomUUID(),
      error: undefined,
    });
  for (const c of await tx.objectStore("cursors").getAll())
    if (c.accountId === id) await tx.objectStore("cursors").delete(c.id);
  await tx.done;
  notify();
}
export async function updateAccount(a: Account) {
  const d = await db();
  await d.put("accounts", a);
  notify();
}
