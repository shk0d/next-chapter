import { useEffect, useState } from "react";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  Unplug,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { type Account, type Provider } from "../domain/model";
import {
  connect,
  disconnect,
  isExtension,
  accountToken,
} from "../integrations/auth";
import { listFolders } from "../integrations/microsoft";
import { db, updateAccount } from "../db/database";
import { requestSync } from "../background/sync";
import { Modal, formatDate } from "./components";
export function Connections({
  accounts,
  onClose,
  toast,
}: {
  accounts: Account[];
  onClose: () => void;
  toast: (s: string) => void;
}) {
  const [busy, setBusy] = useState<Provider>();
  const [error, setError] = useState("");
  const [lookback, setLookback] = useState(90);
  const [folders, setFolders] = useState<{ id: string; displayName: string }[]>(
    [],
  );
  const ms = accounts.find((a) => a.provider === "microsoft" && a.connected);
  useEffect(() => {
    if (ms && isExtension())
      void accountToken(ms)
        .then((t) => listFolders(ms, t))
        .then(setFolders)
        .catch(() => {});
  }, [ms?.id, ms?.connected]);
  async function start(provider: Provider) {
    setError("");
    setBusy(provider);
    try {
      await connect(provider, lookback);
      toast("Mailbox connected. Checking for application emails…");
      await requestSync(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  async function rescan(a: Account) {
    if (
      !confirm(
        `Rescan the last ${lookback} days for ${a.label}? Existing applications and decisions will be preserved.`,
      )
    )
      return;
    try {
      const d = await db();
      const tx = d.transaction(["accounts", "cursors"], "readwrite");
      await tx.objectStore("accounts").put({
        ...a,
        lookback,
        nextFolder: 0,
        lastSync: undefined,
        retryAt: undefined,
        generation: crypto.randomUUID(),
      });
      for (const c of await tx.objectStore("cursors").getAll())
        if (c.accountId === a.id) await tx.objectStore("cursors").delete(c.id);
      await tx.done;
      await requestSync(true);
      toast("Rescan started.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Email connections" onClose={onClose} wide>
      <p className="muted">
        Read application updates from Gmail and Outlook. Parsing happens on this
        device. We never send mail, modify your inbox, or upload it to an AI
        service.
      </p>
      <div className="notice">
        <ShieldCheck size={20} />
        <div>
          <strong>Your tracker stays local.</strong>
          <p>
            Email sync runs while Chrome is open, about every 15 minutes.
            Ambiguous messages go to Review. It may miss applications without a
            recognizable email.
          </p>
        </div>
      </div>
      <label className="lookback">
        Initial scan / rescan
        <select
          value={lookback}
          onChange={(e) => setLookback(Number(e.target.value))}
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last year</option>
        </select>
      </label>
      {(["gmail", "microsoft"] as const).map((provider) => {
        const a = accounts.find((a) => a.provider === provider);
        return (
          <section className="connection" key={provider}>
            <div className="connection-title">
              <div className={`mail-logo ${provider}`}>
                <Mail size={24} />
              </div>
              <div>
                <h3>
                  {provider === "gmail" ? "Gmail" : "Outlook / Microsoft 365"}
                </h3>
                <p>{a?.label ?? "Not connected"}</p>
              </div>
              {a?.connected && (
                <span className="connected">
                  <CheckCircle2 size={14} />
                  Connected
                </span>
              )}
            </div>
            {a?.error && (
              <p className="error" role="status">
                {a.error}
              </p>
            )}
            {a?.connected && (
              <p className="muted tiny">
                {a.lastSync
                  ? `Last complete sync: ${formatDate(a.lastSync)} ${new Date(a.lastSync).toLocaleTimeString()}`
                  : "Initial scan pending or in progress."}{" "}
                · {a.lookback}-day initial scan
              </p>
            )}
            <div className="actions">
              <button
                className={a?.connected ? "" : "primary"}
                disabled={!!busy}
                onClick={() => void start(provider)}
              >
                <Mail size={15} />
                {busy === provider
                  ? "Connecting…"
                  : a?.connected
                    ? "Reconnect"
                    : `Connect ${provider === "gmail" ? "Gmail" : "Outlook"}`}
              </button>
              {a?.connected && (
                <>
                  <button
                    onClick={() =>
                      void requestSync(true)
                        .then(() =>
                          toast(
                            "Email check requested. Longer scans continue in the background.",
                          ),
                        )
                        .catch((e) => setError(e.message))
                    }
                  >
                    <RefreshCw size={15} />
                    Sync now
                  </button>
                  <button onClick={() => void rescan(a)}>
                    <Settings2 size={15} />
                    Rescan
                  </button>
                  <button
                    onClick={() =>
                      void disconnect(a)
                        .then(() =>
                          toast(
                            "Disconnected. Imported applications remain on this device.",
                          ),
                        )
                        .catch((e) => setError(e.message))
                    }
                  >
                    <Unplug size={15} />
                    Disconnect
                  </button>
                </>
              )}
            </div>
            {provider === "microsoft" && a?.connected && (
              <details>
                <summary>Folders to check</summary>
                <p className="muted tiny">
                  Inbox by default. Include folders where your mail rules move
                  recruiting messages. Changing folders applies on the next
                  sync.
                </p>
                {[
                  { id: "inbox", displayName: "Inbox" },
                  ...folders.filter(
                    (f) => f.displayName.toLowerCase() !== "inbox",
                  ),
                ].map((f) => (
                  <label className="check-label" key={f.id}>
                    <input
                      type="checkbox"
                      checked={a.folders.includes(f.id)}
                      onChange={async (e) => {
                        const chosen = e.target.checked
                          ? [...a.folders, f.id]
                          : a.folders.filter((id) => id !== f.id);
                        if (!chosen.length) {
                          setError("Select at least one folder.");
                          return;
                        }
                        await updateAccount({
                          ...a,
                          folders: chosen,
                          nextFolder: 0,
                          generation: crypto.randomUUID(),
                          lastSync: undefined,
                          retryAt: undefined,
                        });
                      }}
                    />
                    {f.displayName}
                  </label>
                ))}
              </details>
            )}
          </section>
        );
      })}
      <details className="setup">
        <summary>First-time OAuth setup</summary>
        <p>
          Register your own Google Cloud and Microsoft Entra apps, add their
          public client IDs to <code>.env.local</code>, then rebuild and reload.
          Full steps are in the project’s <code>README.md</code>.
        </p>
        <p>
          Extension ID:{" "}
          <code>
            {isExtension()
              ? chrome.runtime.id
              : "Available after loading unpacked extension"}
          </code>
        </p>
        <p>
          Microsoft SPA redirect:{" "}
          <code>
            {isExtension()
              ? chrome.identity.getRedirectURL("microsoft")
              : "https://EXTENSION_ID.chromiumapp.org/microsoft"}
          </code>
        </p>
        <p>
          Outlook credentials last for this Chrome session. Reconnect after
          quitting Chrome. Disconnect removes local authorization; you can
          revoke app consent in your provider’s account settings.
        </p>
      </details>
      {!isExtension() && (
        <p className="notice">
          You’re in the browser preview. Load the unpacked extension to connect
          real mailboxes.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
