import { useState } from "react";
import { Upload, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Modal } from "./components";
import {
  backupText,
  download,
  readCsv,
  importApplications,
  restoreBackup,
  validateBackup,
  toCsv,
} from "../import-export/files";
import { type Application } from "../domain/model";
export function Portability({
  applications,
  onClose,
  toast,
}: {
  applications: Application[];
  onClose: () => void;
  toast: (s: string) => void;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"csv" | "json">("csv");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"skip" | "separate">("skip");
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = kind === "csv" && text ? readCsv(text, mapping) : undefined;
  async function run() {
    setBusy(true);
    setError("");
    try {
      if (kind === "json") {
        validateBackup(text);
        if (
          restoreMode === "replace" &&
          !confirm(
            "Replace all applications, evidence and review history with this backup? Mailboxes will be disconnected.",
          )
        )
          return;
        await restoreBackup(text, restoreMode);
        toast("Backup restored. Reconnect mailboxes when ready.");
      } else {
        if (!parsed || parsed.errors.length)
          throw new Error("Resolve CSV errors before importing.");
        const count = await importApplications(parsed.apps, mode);
        toast(`${count} applications imported.`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Import & export" onClose={onClose} wide>
      <p className="muted">
        CSV is a flat tracker snapshot. JSON preserves records, status history,
        email evidence and review decisions. Neither includes sign-in
        credentials.
      </p>
      <div className="export-grid">
        <button
          onClick={() =>
            download(
              "applications.csv",
              toCsv(applications),
              "text/csv;charset=utf-8",
            )
          }
        >
          <FileSpreadsheet size={20} />
          <span>
            Export all applications
            <small>CSV · {applications.length} records</small>
          </span>
          <Download size={16} />
        </button>
        <button
          onClick={async () => {
            try {
              download(
                "next-chapter-backup.json",
                await backupText(),
                "application/json",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <FileJson size={20} />
          <span>
            Back up tracker<small>Versioned JSON</small>
          </span>
          <Download size={16} />
        </button>
      </div>
      <h3>Import a file</h3>
      <label className="file-picker">
        <Upload size={20} />
        <span>Choose CSV or JSON backup</span>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 20 * 1024 * 1024) {
              setError("Choose a file smaller than 20 MB.");
              return;
            }
            setKind(f.name.endsWith(".json") ? "json" : "csv");
            setText(await f.text());
            setMapping({});
            setError("");
          }}
        />
      </label>
      {text && kind === "csv" && parsed && (
        <>
          <div className="form-grid mapping">
            {[
              "company",
              "role",
              "status",
              "appliedDate",
              "notes",
              "action",
              "actionDate",
            ].map((k) => (
              <label key={k}>
                {k}
                <select
                  value={mapping[k] ?? (parsed.headers.includes(k) ? k : "")}
                  onChange={(e) =>
                    setMapping({ ...mapping, [k]: e.target.value })
                  }
                >
                  <option value="">Not mapped</option>
                  {parsed.headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p>
            {parsed.apps.length} valid rows · {parsed.errors.length} errors
          </p>
          {parsed.errors.length > 0 && (
            <div className="error" role="alert">
              {parsed.errors.slice(0, 10).map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          {parsed.apps.slice(0, 4).map((a) => (
            <p className="tiny" key={a.id}>
              {a.company} · {a.role} · {a.status}
            </p>
          ))}
          <label>
            Similar records
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="skip">Skip matching IDs / company and role</option>
              <option value="separate">Import as separate applications</option>
            </select>
          </label>
        </>
      )}
      {text && kind === "json" && (
        <label>
          Restore mode
          <select
            value={restoreMode}
            onChange={(e) =>
              setRestoreMode(e.target.value as typeof restoreMode)
            }
          >
            <option value="merge">
              Merge — keep existing records with matching IDs
            </option>
            <option value="replace">
              Replace — overwrite tracker with backup
            </option>
          </select>
          <small>
            Restoring disconnects mailboxes; you can reconnect afterward.
          </small>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Close</button>
        <button
          className="primary"
          disabled={
            !text || busy || (kind === "csv" && !!parsed?.errors.length)
          }
          onClick={() => void run()}
        >
          {busy ? "Importing…" : "Import file"}
        </button>
      </div>
    </Modal>
  );
}
