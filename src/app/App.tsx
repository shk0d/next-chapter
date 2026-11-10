import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  RefreshCw,
  Inbox,
  ArrowUpRight,
  Settings2,
  List,
  Columns3,
  ShieldCheck,
} from "lucide-react";
import { type Application, statuses, blankApplication } from "../domain/model";
import { snapshot, subscribe } from "../db/database";
import { requestSync } from "../background/sync";
import { isExtension } from "../integrations/auth";
import { Chip, Empty, formatDate } from "./components";
import { ApplicationEditor } from "./ApplicationEditor";
import { Portability } from "./Portability";
import { Connections } from "./Connections";
import { Review } from "./Review";
import { Pipeline } from "./Pipeline";
import gmailIcon from "../assets/gmail.svg";
import outlookIcon from "../assets/outlook.svg";
import { isDesignDemo, trackerDatabaseName } from "../design-preview";
type Data = Awaited<ReturnType<typeof snapshot>>;
const empty: Data = {
  applications: [],
  accounts: [],
  candidates: [],
  evidence: [],
};
export function App() {
  const previousHash = useRef(location.hash);
  const [view, setView] = useState<"list" | "pipeline">("pipeline");
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"connections" | "files" | "review">();
  const [detail, setDetail] = useState<Application>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [webQuery, setWebQuery] = useState("");
  const [seenUpdates, setSeenUpdates] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`${trackerDatabaseName}-seen-updates`) || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((key): key is string => typeof key === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [index, setIndex] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const refresh = useCallback(() => {
    void snapshot()
      .then((d) => {
        setData(d);
        setLoading(false);
        setError("");
      })
      .catch(() => {
        setError(
          "Unable to open local storage. Check Chrome storage availability and reload.",
        );
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    const hash = () => {
      if (
        !window.dispatchEvent(
          new Event("tracker-before-navigate", { cancelable: true }),
        )
      ) {
        history.replaceState(
          null,
          "",
          `${location.pathname}${location.search}${previousHash.current}`,
        );
        return;
      }
      previousHash.current = location.hash;
      setDetail(undefined);
    };
    window.addEventListener("hashchange", hash);
    void requestSync().catch(() => {});
    return () => {
      unsub();
      window.removeEventListener("hashchange", hash);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setIndex(0);
  }, [query, filter]);
  const filtered = useMemo(
    () =>
      data.applications
        .filter(
          (a) =>
            (view === "pipeline" || filter === "All" || a.status === filter) &&
            `${a.company} ${a.role} ${a.location}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            (a.actionDone || !a.actionDate
              ? "9999"
              : a.actionDate
            ).localeCompare(
              b.actionDone || !b.actionDate ? "9999" : b.actionDate,
            ) || b.updatedAt.localeCompare(a.updatedAt),
        ),
    [data.applications, filter, query, view],
  );
  const pageIndex = Math.min(
    index,
    Math.max(0, Math.ceil(filtered.length / 10) - 1),
  );
  const visible = filtered.slice(pageIndex * 10, pageIndex * 10 + 10);
  const updatesFor = (status: string) => {
    if (!["OA", "Interview", "Offer"].includes(status)) return [];
    const upcoming = new Date();
    upcoming.setDate(upcoming.getDate() + 7);
    const until = `${upcoming.getFullYear()}-${String(upcoming.getMonth() + 1).padStart(2, "0")}-${String(upcoming.getDate()).padStart(2, "0")}`;
    const actions = data.applications
      .filter(
        (a) =>
          a.status === status &&
          ((!a.actionDone &&
            a.action &&
            a.actionDate &&
            a.actionDate <= until) ||
            a.history.some((h) => h.origin === "email")),
      )
      .map((a) => `application:${a.id}:${a.revision}`);
    const candidates = data.candidates
      .filter((c) => c.state === "pending" && c.proposal.status === status)
      .map((c) => `candidate:${c.id}`);
    return [...actions, ...candidates].filter(
      (key) => !seenUpdates.includes(key),
    );
  };
  function selectStatus(status: string, filterList = true) {
    if (filterList) setFilter(status);
    const updates = updatesFor(status);
    if (!updates.length) return;
    const next = [...new Set([...seenUpdates, ...updates])];
    setSeenUpdates(next);
    try {
      localStorage.setItem(
        `${trackerDatabaseName}-seen-updates`,
        JSON.stringify(next),
      );
    } catch {
      /* Session feedback still works without localStorage. */
    }
  }
  async function searchWeb(e: React.FormEvent) {
    e.preventDefault();
    if (!webQuery.trim()) return;
    if (!isExtension()) {
      setToast(
        "Default browser search is available in the extension. Use the address bar in this preview.",
      );
      return;
    }
    try {
      await chrome.search.query({
        text: webQuery.trim(),
        disposition: "CURRENT_TAB",
      });
    } catch {
      setToast(
        "Could not open browser search. Reload the updated extension and try again.",
      );
    }
  }
  const review = data.candidates.filter((c) => c.state === "pending").length;
  const connected = data.accounts.filter((a) => a.connected);
  const syncErrors = connected.filter((a) => a.error);
  function go() {
    if (
      !window.dispatchEvent(
        new Event("tracker-before-navigate", { cancelable: true }),
      )
    )
      return;
    setDetail(undefined);
    location.hash = "applications";
  }
  function open(a: Application) {
    setDetail(a);
  }
  async function sync() {
    setSyncing(true);
    try {
      if (!isExtension()) {
        setModal("connections");
        return;
      }
      await requestSync(true);
      setToast(
        "Email check requested. Longer scans continue in the background.",
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  return (
    <>
      <header>
        <a
          href="#applications"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <span className="brand-mark">
            <ArrowUpRight size={22} />
          </span>
          Next Chapter
        </a>
        <form
          className="header-search"
          role="search"
          onSubmit={(e) => void searchWeb(e)}
        >
          <Search size={16} />
          <input
            aria-label="Search the web"
            placeholder="Search the web"
            value={webQuery}
            onChange={(e) => setWebQuery(e.target.value)}
          />
          <button type="submit" aria-label="Submit web search">
            <ArrowUpRight size={15} />
          </button>
        </form>
        <div className="mailbox-shortcuts">
          {(["gmail", "microsoft"] as const).map((provider) => {
            const account = connected.find((a) => a.provider === provider);
            const label = provider === "gmail" ? "Gmail" : "Outlook";
            const href =
              provider === "gmail"
                ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account?.label || "")}#inbox`
                : "https://outlook.office.com/mail/";
            return account ? (
              <a
                key={provider}
                className={`mailbox-shortcut ${provider} connected-mailbox`}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${label} inbox`}
                title={`Open ${label} inbox · ${account.label}`}
              >
                <img
                  src={provider === "gmail" ? gmailIcon : outlookIcon}
                  width="22"
                  height="22"
                  alt=""
                />
              </a>
            ) : (
              <button
                key={provider}
                className="mailbox-shortcut"
                disabled
                aria-label={`${label} not connected`}
                title={`Connect ${label} in Connections to open your inbox`}
              >
                <img
                  src={provider === "gmail" ? gmailIcon : outlookIcon}
                  width="22"
                  height="22"
                  alt=""
                />
              </button>
            );
          })}
        </div>
        <div className="header-actions">
          <button className="text-button" onClick={() => setModal("files")}>
            <Download size={15} /> Import / export
          </button>
          <button
            className="header-settings"
            onClick={() => setModal("connections")}
          >
            <Settings2 size={17} />
            <span>Connections</span>
            {connected.length > 0 && <span className="connection-dot" />}
          </button>
        </div>
      </header>
      <main>
        {!isExtension() && (
          <div className="preview-banner">
            <span className="preview-label">DESIGN PREVIEW</span>
            <span>
              {isDesignDemo
                ? "Fictional applications · separate demo workspace"
                : "Your local tracker · email requires the extension"}
            </span>
            <div className="preview-switch" aria-label="Preview data">
              <a
                href="?demo=1"
                aria-current={isDesignDemo ? "page" : undefined}
              >
                Demo data
              </a>
              <a href="?" aria-current={!isDesignDemo ? "page" : undefined}>
                My tracker
              </a>
            </div>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={refresh}>Retry</button>
          </div>
        )}
        {detail ? (
          <ApplicationEditor
            key={detail.id}
            initial={detail}
            applications={data.applications}
            evidence={data.evidence}
            onClose={() => setDetail(undefined)}
          />
        ) : (
          <>
            <section
              className="tracker-surface"
              aria-label="Application workspace"
            >
              <div className="workspace-heading">
                <h1 className="workspace-title">Applications</h1>
                <div className="workspace-tools">
                  {review > 0 && (
                    <button
                      className="review-button"
                      onClick={() => setModal("review")}
                    >
                      <Inbox size={15} /> Review {review}
                    </button>
                  )}
                  {connected.length > 0 && (
                    <button
                      className="text-button"
                      disabled={syncing}
                      onClick={() => void sync()}
                    >
                      <RefreshCw size={14} className={syncing ? "spin" : ""} />
                      Sync now
                    </button>
                  )}
                  {syncErrors.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() => setModal("connections")}
                    >
                      Connection needs attention
                    </button>
                  )}
                </div>
                <div
                  className="view-switch"
                  role="group"
                  aria-label="Application view"
                >
                  <button
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List size={15} /> List
                  </button>
                  <button
                    aria-pressed={view === "pipeline"}
                    onClick={() => setView("pipeline")}
                  >
                    <Columns3 size={15} /> Pipeline
                  </button>
                </div>
                <button
                  className="primary"
                  onClick={() => open(blankApplication())}
                >
                  <Plus size={16} /> Add application
                </button>
              </div>
              <div className="filters">
                <div className="search-input">
                  <Search size={20} />
                  <input
                    aria-label="Search applications"
                    placeholder="Search company or role"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              {view === "list" && (
                <div className="status-tabs" aria-label="Application statuses">
                  {["All", ...statuses].map((s) => (
                    <button
                      key={s}
                      aria-label={`${s} ${s === "All" ? data.applications.length : data.applications.filter((a) => a.status === s).length}`}
                      aria-pressed={filter === s}
                      className={`${filter === s ? "selected" : ""} ${updatesFor(s).length ? "has-update" : ""}`}
                      onClick={() => selectStatus(s)}
                      title={
                        updatesFor(s).length
                          ? `${updatesFor(s).length} new updates or upcoming actions`
                          : undefined
                      }
                    >
                      {updatesFor(s).length > 0 && (
                        <span
                          className="unread-badge"
                          aria-label={`${updatesFor(s).length} updates`}
                        >
                          {updatesFor(s).length}
                        </span>
                      )}
                      {s}
                      <span className="status-count">
                        {s === "All"
                          ? data.applications.length
                          : data.applications.filter((a) => a.status === s)
                              .length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div className="empty" role="status">
                  Loading your tracker…
                </div>
              ) : !data.applications.length ? (
                <Empty
                  title="Your next chapter starts here"
                  action={
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() => open(blankApplication())}
                      >
                        <Plus size={16} />
                        Add your first application
                      </button>
                      <button onClick={() => setModal("connections")}>
                        <Mail size={16} />
                        Connect email
                      </button>
                    </div>
                  }
                >
                  Keep every opportunity, conversation, and next step in one
                  place. Add an application, import a CSV, or connect your
                  mailbox.
                </Empty>
              ) : !filtered.length ? (
                <Empty
                  title="No applications found"
                  action={
                    <button
                      onClick={() => {
                        setQuery("");
                        setFilter("All");
                      }}
                    >
                      Clear filters
                    </button>
                  }
                >
                  Try a different company, role, or status.
                </Empty>
              ) : view === "pipeline" ? (
                <Pipeline
                  applications={filtered}
                  updatesFor={updatesFor}
                  onAcknowledge={(status) => selectStatus(status, false)}
                  onOpen={open}
                  onAdd={(status) => open({ ...blankApplication(), status })}
                />
              ) : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Company / role</th>
                          <th>Status</th>
                          <th>Applied</th>
                          <th>Next action / last update</th>
                          <th>
                            <span className="sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <button
                                className="company-button"
                                onClick={() => open(a)}
                              >
                                <span className="table-logo">
                                  {a.company.slice(0, 1).toUpperCase()}
                                </span>
                                <span>
                                  <strong>{a.company}</strong>
                                  <small>{a.role}</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <Chip status={a.status} />
                            </td>
                            <td className="applied-date">
                              {a.appliedDate
                                ? formatDate(a.appliedDate)
                                : "Not yet applied"}
                            </td>
                            <td>
                              <span className={a.actionDone ? "completed" : ""}>
                                {a.action || `Last update · ${a.status}`}
                              </span>
                              <small>
                                {a.actionDate
                                  ? `${a.actionDone ? "Completed · " : "Due "}${formatDate(a.actionDate)}`
                                  : formatDate(a.updatedAt)}
                              </small>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Open ${a.company} application`}
                                onClick={() => open(a)}
                              >
                                <ChevronRight size={20} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination">
                    <span>
                      {pageIndex * 10 + 1}–
                      {Math.min(pageIndex * 10 + 10, filtered.length)} of{" "}
                      {filtered.length} applications
                    </span>
                    <div className="actions">
                      <button
                        disabled={pageIndex === 0}
                        onClick={() => setIndex(pageIndex - 1)}
                      >
                        <ChevronLeft size={15} />
                        Previous
                      </button>
                      <button
                        disabled={(pageIndex + 1) * 10 >= filtered.length}
                        onClick={() => setIndex(pageIndex + 1)}
                      >
                        Next
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
            <footer>
              <span>
                <ShieldCheck size={14} />
                Private by default. Saved on this device.
              </span>
              <button className="text-button" onClick={() => setModal("files")}>
                Back up your tracker
                <ArrowUpRight size={13} />
              </button>
            </footer>
          </>
        )}
      </main>
      {modal === "connections" && (
        <Connections
          accounts={data.accounts}
          onClose={() => setModal(undefined)}
          toast={setToast}
        />
      )}{" "}
      {modal === "files" && (
        <Portability
          applications={data.applications}
          onClose={() => setModal(undefined)}
          toast={setToast}
        />
      )}{" "}
      {modal === "review" && (
        <Review
          candidates={data.candidates}
          applications={data.applications}
          onClose={() => setModal(undefined)}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
