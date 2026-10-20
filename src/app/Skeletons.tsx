import { useState } from "react";
import {
  CalendarDays,
  CheckSquare2,
  ArrowRight,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type Application } from "../domain/model";
import { Chip, formatDate } from "./components";
export function Skeletons({
  page,
  applications,
  onApplications,
  onOpen,
}: {
  page: string;
  applications: Application[];
  onApplications: () => void;
  onOpen: (a: Application) => void;
}) {
  const [view, setView] = useState("Week");
  const schedule = (
    <div className="placeholder-block">
      <CalendarDays size={24} />
      <h3>Your schedule, in one place</h3>
      <p>
        Calendar connections and application event projections are coming next.
      </p>
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
    </div>
  );
  const tasks = (
    <div className="placeholder-block">
      <CheckSquare2 size={24} />
      <h3>Task list preview</h3>
      <p>
        School, career, and personal tasks will live here. Task editing is not
        available yet.
      </p>
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
    </div>
  );
  return (
    <>
      <div className="section-top">
        <div>
          <h1>{page}</h1>
          <p>
            {page === "Today"
              ? "Schedule, tasks, and applications."
              : page === "Tasks"
                ? "School, career, and personal tasks."
                : "Events and application deadlines."}
          </p>
        </div>
        <span className="tag preview-tag">Screen preview · coming next</span>
      </div>
      {page === "Today" ? (
        <div className="today-grid">
          <div>
            <form
              className="web-search"
              action="https://www.google.com/search"
              method="get"
            >
              <Search size={19} />
              <input
                name="q"
                aria-label="Search the web"
                placeholder="Search the web"
                required
              />
              <button type="submit">↵</button>
            </form>
            <div className="section-top">
              <h2>Schedule</h2>
              <span className="muted">
                {formatDate(new Date().toISOString())}
              </span>
            </div>
            {schedule}
            <h2>Tasks</h2>
            {tasks}
          </div>
          <div className="today-applications">
            <div className="section-top">
              <h2>
                Applications{" "}
                <span className="count">{applications.length}</span>
              </h2>
              <button className="text-button" onClick={onApplications}>
                View all
                <ArrowRight size={15} />
              </button>
            </div>
            {applications.length ? (
              applications.slice(0, 12).map((a) => (
                <button
                  key={a.id}
                  className="mini-app"
                  onClick={() => onOpen(a)}
                >
                  <span>
                    <strong>{a.company}</strong>
                    <small>{a.role}</small>
                  </span>
                  <Chip status={a.status} />
                </button>
              ))
            ) : (
              <div className="placeholder-block">
                <h3>Your job search starts here</h3>
                <p>
                  Add your first application or connect email to start tracking.
                </p>
                <button onClick={onApplications}>
                  Open applications
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : page === "Tasks" ? (
        <>
          <div className="preview-tabs">
            <span className="active">All tasks</span>
            <span>School</span>
            <span>Career</span>
            <span>Personal</span>
          </div>
          <div className="skeleton-columns">
            <section className="panel">
              <h2>Upcoming</h2>
              {tasks}
            </section>
            <section className="panel">
              <h2>No due date</h2>
              {tasks}
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="calendar-toolbar">
            <div className="actions">
              <button aria-label="Previous period" disabled>
                <ChevronLeft size={16} />
              </button>
              <strong>
                {new Date().toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              <button aria-label="Next period" disabled>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="segmented">
              {["Day", "Week", "Month"].map((v) => (
                <button
                  key={v}
                  className={view === v ? "selected" : ""}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className={`calendar-preview ${view.toLowerCase()}`}>
            {Array.from(
              { length: view === "Day" ? 1 : view === "Week" ? 7 : 35 },
              (_, i) => (
                <div key={i}>
                  <span>
                    {view === "Month"
                      ? (i % 31) + 1
                      : view === "Week"
                        ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]
                        : "Today"}
                  </span>
                </div>
              ),
            )}
          </div>
          <p className="muted tiny">
            Layout preview. Calendar navigation, events and connections are not
            implemented yet.
          </p>
        </>
      )}
    </>
  );
}
