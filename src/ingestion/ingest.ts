import { db, notify } from "../db/database";
import {
  blankApplication,
  normalize,
  now,
  type Application,
  type Candidate,
  type Cursor,
  type Email,
} from "../domain/model";
import { evidenceFor, parseEmail } from "./parser";
export async function commitMailBatch(
  accountId: string,
  generation: string,
  messages: Email[],
  cursor: Cursor,
  owner: string,
) {
  const d = await db();
  const tx = d.transaction(
    [
      "applications",
      "evidence",
      "candidates",
      "tombstones",
      "cursors",
      "accounts",
      "locks",
    ],
    "readwrite",
  );
  const account = await tx.objectStore("accounts").get(accountId);
  const lock = await tx.objectStore("locks").get(accountId);
  if (
    !account?.connected ||
    account.generation !== generation ||
    lock?.owner !== owner ||
    lock.until < Date.now()
  ) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Sync stopped; connection or sync ownership changed.");
  }
  const apps = await tx.objectStore("applications").getAll();
  const tombstones = await tx.objectStore("tombstones").getAll();
  const existingEvidence = await tx.objectStore("evidence").getAll();
  for (const mail of messages) {
    const evidence = evidenceFor(mail);
    if (await tx.objectStore("evidence").get(evidence.id)) continue;
    const proposal = parseEmail(mail);
    if (!proposal) continue;
    const matchKey = `${normalize(proposal.company)}:${normalize(proposal.role)}`;
    evidence.matchKey = matchKey;
    evidence.confidence = proposal.confidence;
    await tx.objectStore("evidence").put(evidence);
    if (tombstones.some((t) => t.sourceIds.includes(evidence.id))) continue;
    const matches = apps.filter(
      (a) =>
        (normalize(a.company) === normalize(proposal.company) &&
          normalize(a.role) === normalize(proposal.role)) ||
        (!!proposal.company &&
          !!proposal.role &&
          a.sourceIds.some((id) =>
            existingEvidence.some(
              (e) => e.id === id && e.matchKey === matchKey,
            ),
          )),
    );
    const crossProviderDuplicate =
      !!mail.internetId &&
      existingEvidence.some((e) => e.internetId === mail.internetId);
    const blocked = tombstones.some(
      (t) =>
        t.matchKey ===
        `${normalize(proposal.company)}:${normalize(proposal.role)}`,
    );
    if (
      proposal.confidence !== "high" ||
      matches.length > 1 ||
      crossProviderDuplicate ||
      blocked ||
      (matches.length === 1 &&
        (!matches[0].sourceIds.length ||
          !matches[0].sourceIds.every((s) =>
            s.startsWith(`${mail.provider}:${accountId}:`),
          )))
    ) {
      await tx.objectStore("candidates").put({
        id: evidence.id,
        evidence,
        proposal: {
          ...proposal,
          reason: blocked
            ? "A matching application was deleted. Confirm before creating it again."
            : matches.length
              ? "Possible existing application. Choose a record or create a separate application."
              : proposal.reason,
        },
        state: "pending",
      });
      continue;
    }
    let a = matches[0];
    if (!a) {
      a = {
        ...blankApplication(),
        company: proposal.company,
        role: proposal.role,
        status: proposal.status,
        appliedDate:
          proposal.status === "Applied" ? mail.receivedAt.slice(0, 10) : "",
        createdAt: now(),
      };
      apps.push(a);
    }
    const latest = a.history.reduce((v, h) => (h.at > v ? h.at : v), "");
    const conflict =
      a.overrides.includes("status") || (latest && mail.receivedAt < latest);
    if (conflict && a.status !== proposal.status) {
      await tx.objectStore("candidates").put({
        id: evidence.id,
        evidence,
        proposal: {
          ...proposal,
          confidence: "review",
          reason:
            "Manual status correction or older message. Review before changing the current status.",
        },
        state: "pending",
      });
      continue;
    }
    if (!a.history.some((h) => h.evidenceId === evidence.id))
      a.history.push({
        id: crypto.randomUUID(),
        status: proposal.status,
        at: mail.receivedAt,
        origin: "email",
        evidenceId: evidence.id,
      });
    if (!conflict) a.status = proposal.status;
    a.sourceIds = [...new Set([...a.sourceIds, evidence.id])];
    a.updatedAt = now();
    a.revision++;
    await tx.objectStore("applications").put(a);
    existingEvidence.push(evidence);
  }
  await tx.objectStore("cursors").put(cursor);
  const nextFolder =
    account.provider === "microsoft"
      ? cursor.complete
        ? (account.folders.indexOf(cursor.folder) + 1) % account.folders.length
        : account.folders.indexOf(cursor.folder)
      : 0;
  await tx.objectStore("accounts").put({
    ...account,
    lastSync: cursor.complete && nextFolder === 0 ? now() : account.lastSync,
    nextFolder,
    error: undefined,
    retryAt: undefined,
    failures: 0,
  });
  await tx.done;
  notify();
}
export async function resolveCandidate(
  candidate: Candidate,
  decision: "dismiss" | "accept",
  edit?: {
    company: string;
    role: string;
    status: Application["status"];
    targetId?: string;
  },
) {
  const d = await db();
  const tx = d.transaction(
    ["applications", "candidates", "tombstones"],
    "readwrite",
  );
  const current = await tx.objectStore("candidates").get(candidate.id);
  if (current?.state !== "pending") {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("This email was already reviewed in another tab.");
  }
  if (decision === "dismiss") {
    await tx.objectStore("candidates").put({ ...current, state: "dismissed" });
    await tx.done;
    notify();
    return;
  }
  if (!edit?.company.trim() || !edit.role.trim()) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("Company and role are required.");
  }
  const existing = edit.targetId
    ? await tx.objectStore("applications").get(edit.targetId)
    : undefined;
  if (edit.targetId && !existing) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("The selected application was deleted.");
  }
  const a = existing ?? blankApplication();
  a.company = existing?.company ?? edit.company.trim();
  a.role = existing?.role ?? edit.role.trim();
  a.status = edit.status;
  a.overrides = [...new Set([...a.overrides, "status"])];
  a.sourceIds = [...new Set([...a.sourceIds, candidate.evidence.id])];
  a.history.push({
    id: crypto.randomUUID(),
    status: edit.status,
    at: now(),
    origin: "manual",
    evidenceId: candidate.evidence.id,
  });
  a.updatedAt = now();
  a.revision++;
  if (!a.appliedDate && edit.status === "Applied")
    a.appliedDate = candidate.evidence.receivedAt.slice(0, 10);
  await tx.objectStore("applications").put(a);
  await tx
    .objectStore("candidates")
    .put({ ...current, state: "accepted", applicationId: a.id });
  await tx.done;
  notify();
}
