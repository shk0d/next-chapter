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
  BriefcaseBusiness,
  CalendarClock,
  ArrowUp,
  Settings2,
} from "lucide-react";
import {
  type Application,
  statuses,
  metrics,
  blankApplication,
} from "../domain/model";
import { snapshot, subscribe } from "../db/database";
import { requestSync } from "../background/sync";
import { isExtension } from "../integrations/auth";
import { Chip, Empty, formatDate } from "./components";
import { ApplicationEditor } from "./ApplicationEditor";
import { Portability } from "./Portability";
import { Connections } from "./Connections";
import { Review } from "./Review";
import { Skeletons } from "./Skeletons";
type Data = Awaited<ReturnType<typeof snapshot>>;
const empty: Data = {
  applications: [],
  accounts: [],
  candidates: [],
  evidence: [],
};
const pages = ["Today", "Tasks", "Calendar", "Applications"];
function route() {
  const p = location.hash.slice(1).split("/")[0];
  return pages.find((x) => x.toLowerCase() === p) ?? "Applications";
}
export function App() {
  const previousHash = useRef(location.hash);
  const [page, setPage] = useState(route);
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"connections" | "files" | "review">();
  const [detail, setDetail] = useState<Application>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("action");
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
      setPage(route());
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
  }, [query, filter, sort]);
  const filtered = useMemo(
    () =>
      data.applications
        .filter(
          (a) =>
            (filter === "All" || a.status === filter) &&
            `${a.company} ${a.role} ${a.location}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "company"
            ? a.company.localeCompare(b.company)
            : sort === "updated"
              ? b.updatedAt.localeCompare(a.updatedAt)
              : (a.actionDone || !a.actionDate
                  ? "9999"
                  : a.actionDate
                ).localeCompare(
                  b.actionDone || !b.actionDate ? "9999" : b.actionDate,
                ) || b.updatedAt.localeCompare(a.updatedAt),
        ),
    [data.applications, filter, query, sort],
  );
  const pageIndex = Math.min(
    index,
    Math.max(0, Math.ceil(filtered.length / 10) - 1),
  );
  const visible = filtered.slice(pageIndex * 10, pageIndex * 10 + 10);
  const m = metrics(data.applications);
  const review = data.candidates.filter((c) => c.state === "pending").length;
  const connected = data.accounts.filter((a) => a.connected);
  const syncErrors = connected.filter((a) => a.error);
  function go(p: string) {
    if (
      !window.dispatchEvent(
        new Event("tracker-before-navigate", { cancelable: true }),
      )
    )
      return;
    setDetail(undefined);
    setPage(p);
    location.hash = p.toLowerCase();
  }
  function open(a: Application) {
    setDetail(a);
    setPage("Applications");
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
            go("Applications");
          }}
        >
          <span className="brand-mark">
            <ArrowUpRight size={22} />
          </span>
          Next Chapter
        </a>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              className={page === p ? "active" : ""}
              onClick={() => go(p)}
            >
              {p}
            </button>
          ))}
        </nav>
        <button
          className="header-settings"
          onClick={() => setModal("connections")}
        >
          <Settings2 size={17} />
          <span>Connections</span>
          {connected.length > 0 && <span className="connection-dot" />}
        </button>
      </header>
      <main>
        {!isExtension() && (
          <div className="preview-banner">
            <span>LOCAL PREVIEW</span>Tracker data is saved in this browser.
            Load the extension to connect email.
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
        ) : page === "Applications" ? (
          <>
            <div className="section-top page-heading">
              <div>
                <h1>Applications</h1>
                <p>Track every opportunity, from interest to offer.</p>
              </div>
              <button
                className="primary"
                onClick={() => open(blankApplication())}
              >
                <Plus size={18} />
                Add application
              </button>
            </div>
            <div className="metrics">
              {[
                {
                  label: "Submitted",
                  value: m.submitted,
                  note: "Across all submitted applications",
                  icon: <BriefcaseBusiness size={17} />,
                },
                {
                  label: "Reached interview",
                  value: m.interviews,
                  note: "Based on your stage history",
                  icon: <ArrowUp size={17} />,
                },
                {
                  label: "Action due in 7 days",
                  value: m.due,
                  note: "Your upcoming next steps",
                  icon: <CalendarClock size={17} />,
                },
                {
                  label: "Offers",
                  value: m.offers,
                  note: "Currently at the offer stage",
                  icon: <ArrowUpRight size={17} />,
                },
              ].map((s) => (
                <div className="metric" key={s.label}>
                  <div>
                    <span>{s.label}</span>
                    {s.icon}
                  </div>
                  <strong>{s.value}</strong>
                  <small>{s.note}</small>
                </div>
              ))}
            </div>
            <div className="sync-strip">
              <div className="sync-label">
                <span
                  className={`status-dot ${syncErrors.length ? "warning" : connected.length ? "live" : ""}`}
                />
                <span>
                  {connected.length
                    ? `${connected.length} mailbox${connected.length > 1 ? "es" : ""} connected`
                    : "Email is not connected"}
                </span>
                <span className="muted">
                  {syncErrors.length
                    ? `${syncErrors.length} connection${syncErrors.length > 1 ? "s" : ""} need attention`
                    : connected.length
                      ? "Checks every 15 min while Chrome is open"
                      : "Connect Gmail and Outlook to track updates automatically."}
                </span>
              </div>
              <div className="actions">
                {review > 0 && (
                  <button
                    className="review-button"
                    onClick={() => setModal("review")}
                  >
                    <Inbox size={15} />
                    Review <span>{review}</span>
                  </button>
                )}
                {connected.length > 0 && (
                  <button
                    className="text-button"
                    disabled={syncing}
                    onClick={() => void sync()}
                  >
                    <RefreshCw size={14} className={syncing ? "spin" : ""} />
                    {syncing ? "Checking…" : "Sync now"}
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => setModal("connections")}
                >
                  <Mail size={15} />
                  {connected.length ? "Manage email" : "Connect email"}
                </button>
              </div>
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
              <select
                aria-label="Filter status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="All">All statuses</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label="Sort applications"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="action">Next action date</option>
                <option value="updated">Last updated</option>
                <option value="company">Company A–Z</option>
              </select>
              <button
                className="text-button export-link"
                onClick={() => setModal("files")}
              >
                Import / export
                <Download size={16} />
              </button>
            </div>
            <div className="status-tabs" aria-label="Application statuses">
              {["All", ...statuses].map((s) => (
                <button
                  key={s}
                  aria-label={`${s} ${s === "All" ? data.applications.length : data.applications.filter((a) => a.status === s).length}`}
                  aria-pressed={filter === s}
                  className={filter === s ? "selected" : ""}
                  onClick={() => setFilter(s)}
                >
                  {s}
                  <span>
                    {s === "All"
                      ? data.applications.length
                      : data.applications.filter((a) => a.status === s).length}
                  </span>
                </button>
              ))}
            </div>
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
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Company / role</th>
                        <th>Status</th>
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
            <footer>
              <span>
                <span className="local-dot" />
                Saved on this device
              </span>
              <button className="text-button" onClick={() => setModal("files")}>
                Back up your tracker
                <ArrowUpRight size={13} />
              </button>
            </footer>
          </>
        ) : (
          <Skeletons
            page={page}
            applications={data.applications}
            onApplications={() => go("Applications")}
            onOpen={open}
          />
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
