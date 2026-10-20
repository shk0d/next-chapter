import { useState } from "react";
import { Check, X, Inbox } from "lucide-react";
import { type Application, type Candidate, statuses } from "../domain/model";
import { resolveCandidate } from "../ingestion/ingest";
import { Modal, Empty, External, formatDate } from "./components";
function ReviewItem({
  candidate: c,
  applications,
  onError,
}: {
  candidate: Candidate;
  applications: Application[];
  onError: (s: string) => void;
}) {
  const [company, setCompany] = useState(c.proposal.company);
  const [role, setRole] = useState(c.proposal.role);
  const [status, setStatus] = useState(c.proposal.status);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(accept: boolean) {
    setBusy(true);
    try {
      await resolveCandidate(c, accept ? "accept" : "dismiss", {
        company,
        role,
        status,
        targetId: target || undefined,
      });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-item">
      <div className="section-top">
        <span className="tag">
          {c.evidence.provider === "gmail" ? "Gmail" : "Outlook"} ·{" "}
          {formatDate(c.evidence.receivedAt)}
        </span>
        <External href={c.evidence.url}>Open email</External>
      </div>
      <h3>{c.evidence.subject}</h3>
      <p className="tiny muted">{c.evidence.from}</p>
      <blockquote>{c.evidence.excerpt}</blockquote>
      <p className="review-reason">{c.proposal.reason}</p>
      <label>
        Match to
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            const a = applications.find((a) => a.id === e.target.value);
            if (a) {
              setCompany(a.company);
              setRole(a.role);
            }
          }}
        >
          <option value="">Create a separate application</option>
          {applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.company} — {a.role} ({a.status})
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Company
          <input
            required
            value={company}
            disabled={!!target}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label>
          Role
          <input
            required
            value={role}
            disabled={!!target}
            onChange={(e) => setRole(e.target.value)}
          />
        </label>
        <label>
          Status to apply
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || !company.trim() || !role.trim()}
          onClick={() => void decide(true)}
        >
          <Check size={15} />
          Accept update
        </button>
        <button disabled={busy} onClick={() => void decide(false)}>
          <X size={15} />
          Dismiss
        </button>
      </div>
    </article>
  );
}
export function Review({
  candidates,
  applications,
  onClose,
}: {
  candidates: Candidate[];
  applications: Application[];
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const pending = candidates.filter((c) => c.state === "pending");
  return (
    <Modal
      title={`Review email updates · ${pending.length}`}
      onClose={onClose}
      wide
    >
      <p className="muted">
        Confirm uncertain matches and stages. Accepting an update is a manual
        correction; later email cannot silently overwrite it.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pending.length ? (
        pending.map((c) => (
          <ReviewItem
            key={c.id}
            candidate={c}
            applications={applications}
            onError={setError}
          />
        ))
      ) : (
        <Empty
          title="You’re all caught up"
          action={
            <button onClick={onClose}>
              <Inbox size={16} />
              Back to applications
            </button>
          }
        >
          Email updates that need your decision will appear here.
        </Empty>
      )}
    </Modal>
  );
}
