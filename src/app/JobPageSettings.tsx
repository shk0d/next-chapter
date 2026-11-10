import { useEffect, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { isExtension } from "../integrations/auth";
import {
  captureSettingsKey,
  sitePattern,
  starterJobOrigins,
} from "../job-pages/model";
export function JobPageSettings() {
  const [origins, setOrigins] = useState<string[]>([]);
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (isExtension())
      void chrome.storage.local
        .get(captureSettingsKey)
        .then((value) =>
          setOrigins(
            Array.isArray(value[captureSettingsKey])
              ? (value[captureSettingsKey] as string[])
              : [],
          ),
        );
  }, []);
  async function enable(requested: string[]) {
    setBusy(true);
    setMessage("");
    try {
      if (!(await chrome.permissions.request({ origins: requested }))) {
        setMessage("Site access was not granted. Your tracker still works.");
        return;
      }
      const current = await chrome.storage.local.get(captureSettingsKey);
      const next = [
        ...new Set([
          ...(Array.isArray(current[captureSettingsKey])
            ? (current[captureSettingsKey] as string[])
            : []),
          ...requested,
        ]),
      ];
      await chrome.storage.local.set({ [captureSettingsKey]: next });
      const result = await chrome.runtime.sendMessage({
        type: "JOB_PAGE_SETTINGS",
      });
      if (!result?.ok)
        throw new Error("Could not enable the job-page button. Try again.");
      setOrigins(next);
      setSite("");
      setMessage("Enabled. Reload open job pages to show the button.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disable(origin: string) {
    setBusy(true);
    try {
      const current = await chrome.storage.local.get(captureSettingsKey);
      const next = (current[captureSettingsKey] as string[]).filter(
        (o) => o !== origin,
      );
      await chrome.storage.local.set({ [captureSettingsKey]: next });
      await chrome.runtime.sendMessage({ type: "JOB_PAGE_SETTINGS" });
      await chrome.permissions.remove({ origins: [origin] });
      setOrigins(next);
      setMessage("Job-page button disabled for this site.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="connection">
      <div className="connection-title">
        <div className="mail-logo">
          <BookmarkPlus size={22} />
        </div>
        <div>
          <h3>Job-page button</h3>
          <p>Save a role to Interested while browsing.</p>
        </div>
      </div>
      <p className="tiny">
        Choose sites where Next Chapter can show its button. It reads job
        titles, employers, locations, and the job URL, and saves only when you
        confirm. It never reads application form answers or submits
        applications.
      </p>
      {!isExtension() ? (
        <p className="notice">
          Load the extension to enable the button on real job sites.
        </p>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() => void enable(starterJobOrigins)}
          >
            Enable common job sites
          </button>
          <p className="tiny muted">
            Greenhouse, Lever, Ashby, Workday, Workable, and SmartRecruiters.
            Other sites with structured job postings can be added below.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                void enable([sitePattern(site)]);
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            <label>
              Another job-site URL
              <input
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="https://careers.example.com"
                required
              />
            </label>
            <button disabled={busy || !site.trim()} type="submit">
              Enable this site
            </button>
          </form>
          {origins.length > 0 && (
            <ul className="job-site-list">
              {origins.map((origin) => (
                <li key={origin}>
                  <span>
                    {origin.replace("https://", "").replace("/*", "")}
                  </span>
                  <button disabled={busy} onClick={() => void disable(origin)}>
                    Disable
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
