import { useEffect, useState } from "react";
import { Trash2, Save, ArrowLeft, Check, Pencil } from "lucide-react";
import {
  type Application,
  type Evidence,
  statuses,
  duplicates,
  blankApplication,
} from "../domain/model";
import { saveApplication, removeApplication } from "../db/database";
import { Chip, External, formatDate } from "./components";
export function ApplicationEditor({
  initial,
  applications,
  evidence,
  onClose,
}: {
  initial: Application;
  applications: Application[];
  evidence: Evidence[];
  onClose: () => void;
}) {
  const [a, setA] = useState({ ...initial });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(initial.revision === 0);
  const set = (key: keyof Application, value: unknown) => {
    setA((old) => ({ ...old, [key]: value }));
    setDirty(true);
    setAllowDuplicate(false);
  };
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    const beforeNavigate = (e: Event) => {
      if (dirty && !confirm("Discard unsaved changes?")) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("tracker-before-navigate", beforeNavigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("tracker-before-navigate", beforeNavigate);
    };
  }, [dirty]);
  const close = () => {
    if (!dirty || confirm("Discard unsaved changes?")) onClose();
  };
  const duplicate = applications.find((other) => duplicates(a, other));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (duplicate && !allowDuplicate) {
      setError(
        "A similar application exists. Confirm below to keep this as a separate application.",
      );
      return;
    }
    setBusy(true);
    try {
      await saveApplication(a);
      setDirty(false);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: keyof Application,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label>
      {label}
      <input
        value={String(a[key] ?? "")}
        type={type}
        required={required}
        maxLength={key === "company" || key === "role" ? 200 : 2000}
        onChange={(e) => set(key, e.target.value)}
        readOnly={!editing}
      />
    </label>
  );
  const mail = evidence.filter((e) => a.sourceIds.includes(e.id));
  return (
    <section className="detail">
      <div className="section-top">
        <button className="text-button" onClick={close}>
          <ArrowLeft size={17} />
          All applications
        </button>
        <div className="actions">
          {!editing && (
            <button onClick={() => setEditing(true)}>
              <Pencil size={15} />
              Edit application
            </button>
          )}
          {a.revision > 0 && (
            <button
              className="danger-ghost"
              onClick={async () => {
                if (
                  confirm(
                    `Delete ${a.company} — ${a.role}? Email sync will preserve its deletion history. Export a backup first if you need to restore it.`,
                  )
                ) {
                  try {
                    await removeApplication(a);
                    onClose();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              <Trash2 size={15} />
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="detail-heading">
        <div className="company-logo">{a.company.slice(0, 1) || "+"}</div>
        <div>
          <p className="eyebrow">APPLICATION DETAILS</p>
          <h1>{a.company || "New application"}</h1>
          <p>{a.role || "Keep your next opportunity in view"}</p>
        </div>
        <Chip status={a.status} />
      </div>
      <form onSubmit={save}>
        <div className="detail-grid">
          <div className="panel">
            <h2>Opportunity</h2>
            <div className="form-grid">
              {field("company", "Company", "text", true)}
              {field("role", "Role", "text", true)}
              <label>
                Status
                <select
                  aria-label="Status"
                  value={a.status}
                  disabled={!editing}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {field("appliedDate", "Applied date", "date")}
              {field("location", "Location")}
              {field("requisitionId", "Requisition ID")}
              {field("jobUrl", "Job URL", "url")}
              {field("recruiter", "Recruiter / contact")}
            </div>
            <p className="muted tiny">
              OA means online assessment. You can change stages in any order.
            </p>
            {a.jobUrl && <External href={a.jobUrl}>Open job posting</External>}
          </div>
          <div className="panel">
            <h2>Next action</h2>
            {field("action", "What’s next?")}
            {field("actionDate", "Due date (local date)", "date")}
            <label className="check-label">
              <input
                type="checkbox"
                checked={a.actionDone}
                disabled={!editing}
                onChange={(e) => set("actionDone", e.target.checked)}
              />
              <Check size={14} />
              Action completed
            </label>
            <p className="muted tiny">
              Calendar and task views will use this action in a later release.
            </p>
          </div>
          <div className="panel">
            <h2>Notes</h2>
            <label className="sr-only" htmlFor="notes">
              Application notes
            </label>
            <textarea
              id="notes"
              readOnly={!editing}
              value={a.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Recruiter conversations, interview prep, and follow-ups…"
              rows={7}
              maxLength={40000}
            />
          </div>
          <div className="panel">
            <h2>Activity</h2>
            <ol className="timeline">
              {[...a.history]
                .sort((x, y) => y.at.localeCompare(x.at))
                .map((h) => (
                  <li key={h.id}>
                    <span className="dot" />
                    <div>
                      <strong>{h.status}</strong>
                      <span>
                        {h.origin === "email"
                          ? "Email update"
                          : h.origin === "import"
                            ? "Imported"
                            : "Updated by you"}{" "}
                        · {formatDate(h.at)}
                      </span>
                    </div>
                  </li>
                ))}
              {!a.history.length && (
                <p className="muted">Your first update will appear here.</p>
              )}
            </ol>
          </div>
          <div className="panel span-2">
            <h2>
              Source emails <span className="count">{mail.length}</span>
            </h2>
            {mail.length ? (
              mail.map((e) => (
                <div className="source-row" key={e.id}>
                  <div>
                    <External href={e.url}>
                      {e.subject || "Open source email"}
                    </External>
                    <p>
                      {e.from} · {formatDate(e.receivedAt)}
                    </p>
                    <small>{e.excerpt}</small>
                  </div>
                  <span className="tag">
                    {e.provider === "gmail" ? "Gmail" : "Outlook"}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">
                Added by you. Email matches will link their evidence here.
              </p>
            )}
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {editing && duplicate && (
          <label className="check-label duplicate">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            Keep separate from {duplicate.company} — {duplicate.role}
          </label>
        )}
        {editing && (
          <div className="sticky-actions">
            <span className="muted">
              {dirty ? "Unsaved changes" : "Stored on this device"}
            </span>
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy} type="submit">
              <Save size={16} />
              {busy ? "Saving…" : "Save application"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
export const newApplication = blankApplication;
