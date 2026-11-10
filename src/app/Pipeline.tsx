import { useLayoutEffect, useRef } from "react";
import { Plus, ArrowUpRight } from "lucide-react";
import { statuses, type Application, type Status } from "../domain/model";
import { formatDate } from "./components";

export function Pipeline({
  applications,
  updatesFor,
  onAcknowledge,
  onOpen,
  onAdd,
}: {
  applications: Application[];
  updatesFor: (status: string) => string[];
  onAcknowledge: (status: Status) => void;
  onOpen: (application: Application) => void;
  onAdd: (status: Status) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const columns = useRef(new Map<Status, HTMLElement>());
  const headings = useRef(new Map<Status, HTMLButtonElement>());
  const counts = statuses.map((status) => updatesFor(status).length);
  const signature = counts.join(",");

  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const bounds = viewport.getBoundingClientRect();
      const right = Math.max(0, viewport.clientWidth - 174);
      const items = statuses.map((status, i) => ({
        status,
        count: counts[i],
        x:
          (columns.current.get(status)?.getBoundingClientRect().left ??
            bounds.left) - bounds.left,
      }));
      // Keep a stable card origin while scrolling, but reserve stack space
      // only when an important heading can actually leave the visible area.
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      const mayDock = items.some(
        (item) =>
          item.count &&
          (item.x + viewport.scrollLeft > right ||
            item.x + viewport.scrollLeft - maxScroll < 0),
      );
      const clearance = mayDock
        ? Math.max(56, counts.filter(Boolean).length * 52 + 8)
        : 56;
      const shell = viewport.parentElement;
      const value = `${clearance}px`;
      if (
        shell &&
        shell.style.getPropertyValue("--pipeline-heading-clearance") !== value
      )
        shell.style.setProperty("--pipeline-heading-clearance", value);
      for (const item of items) {
        const heading = headings.current.get(item.status);
        if (!heading) continue;
        let x = item.x;
        let y = 0;
        let scale = item.count ? 1.06 : 1;
        let progress = 0;
        let rank = 0;
        if (item.count && (x > right || x < 0)) {
          const isRight = x > right;
          rank = items
            .filter((entry) => entry.count)
            .findIndex((entry) => entry.status === item.status);
          const distance = isRight ? x - right : -x;
          const t = Math.min(1, distance / 100);
          progress = t * t * (3 - 2 * t);
          // Keep all offscreen updates on the requested right edge. Headings
          // leaving the left edge travel there continuously rather than jumping.
          x = isRight
            ? right - rank * 10 * progress
            : (right - rank * 10) * progress;
          y = rank * 52 * progress;
          scale -= 0.06 * progress;
        }
        heading.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        heading.style.zIndex = String(progress ? 20 - rank : 1);
        heading.dataset.docked = progress > 0 ? "true" : "false";
        heading.title = progress
          ? `Reveal ${item.status} applications without clearing updates`
          : item.count
            ? `Mark ${item.status} updates seen`
            : `${item.status} applications`;
        heading.toggleAttribute("data-floating", progress > 0);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    viewport.addEventListener("scroll", schedule, { passive: true });
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener("scroll", schedule);
    };
  }, [signature, applications.length]);

  return (
    <div className="pipeline-shell">
      <div className="pipeline-heading-layer">
        {statuses.map((status, i) => (
          <button
            key={status}
            ref={(node) => {
              if (node) headings.current.set(status, node);
              else headings.current.delete(status);
            }}
            className={`pipeline-status-heading status-${status.toLowerCase()} ${counts[i] ? "has-update" : ""}`}
            aria-label={`${status}, ${applications.filter((a) => a.status === status).length} applications${counts[i] ? `, ${counts[i]} updates` : ""}`}
            title={
              counts[i]
                ? "Reveal this column; click its heading to mark updates seen"
                : status
            }
            onFocus={(event) => {
              // A clipped absolute heading cannot be brought into view by the
              // browser's normal focus scrolling, so reveal its actual column.
              if (
                !event.currentTarget.matches(":focus-visible") ||
                matchMedia("(prefers-reduced-motion: reduce)").matches
              )
                return;
              const viewport = scroll.current;
              const column = columns.current.get(status);
              if (viewport && column)
                viewport.scrollTo({
                  left:
                    column.getBoundingClientRect().left -
                    viewport.getBoundingClientRect().left +
                    viewport.scrollLeft,
                  behavior: "instant",
                });
            }}
            onClick={(event) => {
              const viewport = scroll.current;
              const column = columns.current.get(status);
              if (
                !matchMedia("(prefers-reduced-motion: reduce)").matches &&
                event.currentTarget.dataset.docked === "true" &&
                viewport &&
                column
              ) {
                const x =
                  column.getBoundingClientRect().left -
                  viewport.getBoundingClientRect().left +
                  viewport.scrollLeft;
                viewport.scrollTo({
                  left: x,
                  behavior:
                    event.detail &&
                    !matchMedia("(prefers-reduced-motion: reduce)").matches
                      ? "smooth"
                      : "instant",
                });
              } else onAcknowledge(status);
            }}
          >
            <span>{status}</span>
            <span className="pipeline-record-count">
              {applications.filter((a) => a.status === status).length}
            </span>
            {counts[i] > 0 && (
              <span className="pipeline-update-badge">{counts[i]}</span>
            )}
          </button>
        ))}
      </div>
      <div
        ref={scroll}
        className="pipeline"
        role="region"
        aria-label="Application pipeline"
        tabIndex={0}
      >
        {statuses.map((status) => {
          const records = applications.filter((a) => a.status === status);
          return (
            <section
              className="pipeline-column"
              key={status}
              ref={(node) => {
                if (node) columns.current.set(status, node);
                else columns.current.delete(status);
              }}
              aria-label={`${status} applications`}
            >
              <div className="pipeline-heading">
                <span className="sr-only">{status}</span>
                <button
                  className="icon-button"
                  aria-label={`Add ${status} application`}
                  onClick={() => onAdd(status)}
                >
                  <Plus size={15} />
                </button>
              </div>
              {records.map((a) => (
                <button
                  className="pipeline-card"
                  key={a.id}
                  onClick={() => onOpen(a)}
                >
                  <span className="pipeline-card-top">
                    <strong>{a.company}</strong>
                    <ArrowUpRight size={14} />
                  </span>
                  <span className="pipeline-role">{a.role}</span>
                  <span className="pipeline-location">
                    {a.location || "Location not added"}
                  </span>
                  <span
                    className={`pipeline-action ${a.actionDone ? "completed" : ""}`}
                  >
                    {a.action || "Add a next step"}
                    <small>
                      {a.actionDate ? formatDate(a.actionDate) : "No due date"}
                    </small>
                  </span>
                </button>
              ))}
              {!records.length && (
                <p className="pipeline-empty">No applications here yet.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
