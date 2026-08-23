import { useEffect, useRef, useState } from "react";
import { Btn } from "@rempeyek/ui";
import { api } from "../api";
import { desktopRuntime } from "../lib/desktop-runtime.mjs";
import { approveAction } from "../hooks/useGateway";
import { releaseState } from "../../lib/release-check.mjs";

const CHECK_KEY = "aos-release-check";
const CHECK_TTL = 12 * 3600 * 1000;
const DESKTOP_UPDATE_ERROR =
  "The desktop updater could not complete this request. Try again from Settings.";

export function UpdateBanner({ onView }) {
  const [runtime] = useState(() => desktopRuntime(
    globalThis.window?.rempeyekDesktop,
  ));
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [desktopUpdate, setDesktopUpdate] = useState(null);
  const [desktopBusy, setDesktopBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [lastVersion, setLastVersion] = useState("");
  const [rel, setRel] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [tail, setTail] = useState([]);
  const [showNotes, setShowNotes] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (runtime.desktop) {
      runtime.getRuntime().then(value => {
        if (alive.current) setDesktopInfo(value);
      }).catch(() => {
        if (alive.current) {
          setDesktopUpdate({ phase: "error", error: DESKTOP_UPDATE_ERROR });
        }
      });
      const unsubscribe = runtime.onUpdateState(value => {
        if (alive.current) {
          setDesktopUpdate(value);
          if (value?.version && value.version !== lastVersion) {
            setLastVersion(value.version);
            setDismissed(false);
          }
        }
      });
      return () => {
        alive.current = false;
        if (typeof unsubscribe === "function") unsubscribe();
      };
    }

    (async () => {
      const v = await api("/api/version");
      if (v.error || !v.repo || !v.version) return;
      let cached = null;
      try {
        const value = JSON.parse(localStorage.getItem(CHECK_KEY) || "null");
        if (
          value &&
          value.repo === v.repo &&
          Date.now() - value.at < CHECK_TTL
        ) {
          cached = value;
        }
      } catch {}
      if (!cached) {
        try {
          const response = await fetch(
            `https://api.github.com/repos/${v.repo}/releases/latest`,
            { headers: { Accept: "application/vnd.github+json" } },
          );
          if (response.ok) {
            const release = await response.json();
            cached = {
              at: Date.now(),
              repo: v.repo,
              tag: release.tag_name || null,
              url: release.html_url || "",
              notes: release.body || "",
            };
          } else if (response.status === 403 || response.status === 404) {
            cached = { at: Date.now(), repo: v.repo, tag: null };
          }
          if (cached) {
            try {
              localStorage.setItem(CHECK_KEY, JSON.stringify(cached));
            } catch {}
          }
        } catch {}
      }
      if (!alive.current || !cached?.tag) return;
      const state = releaseState({
        current: v.version,
        latestTag: cached.tag,
        url: cached.url,
        notes: cached.notes,
      });
      if (state.updateAvailable) {
        setRel(state);
        setDismissed(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [runtime, lastVersion]);

  const sourceUpdate = async () => {
    const approvalId = await approveAction(
      "system.update",
      "dashboard",
      `Update Agent OS ${rel.current} → ${rel.latest}.\nRuns fixed clean-check, fast-forward pull, npm ci, and build steps.`,
    );
    if (!approvalId) return;
    setPhase("updating");
    setTail([]);
    const result = await api("/api/update", {
      method: "POST",
      headers: { "x-approval-id": approvalId },
    });
    if (result.error) {
      setPhase("failed");
      setTail([{ t: "", s: "err", line: result.error }]);
      return;
    }
    let since = 0;
    let lines = [];
    for (let index = 0; index < 600 && alive.current; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const log = await api(
        `/api/proc/os-update/log?since=${since}`,
        { timeoutMs: 5000 },
      );
      if (log.lines?.length) {
        lines = [...lines, ...log.lines];
        setTail(lines.slice(-8));
        since = log.next;
      }
      if (log.status && log.status !== "running") break;
    }
    setPhase(
      lines.some(line => line.line?.includes("update applied"))
        ? "done"
        : "failed",
    );
  };

  const desktopDownload = async () => {
    setDesktopBusy(true);
    try {
      const next = await runtime.downloadUpdate();
      if (next) setDesktopUpdate(next);
    } catch (error) {
      setDesktopUpdate({
        ...desktopUpdate,
        phase: "error",
        error: DESKTOP_UPDATE_ERROR,
      });
    } finally {
      setDesktopBusy(false);
    }
  };

  const desktopRestart = async () => {
    setDesktopBusy(true);
    try {
      await runtime.restartToUpdate();
    } catch (error) {
      setDesktopUpdate({
        ...desktopUpdate,
        phase: "error",
        error: DESKTOP_UPDATE_ERROR,
      });
    } finally {
      setDesktopBusy(false);
    }
  };

  const handleOpenSettings = () => {
    if (typeof onView === "function") {
      onView("settings");
    }
  };

  if (dismissed) return null;

  if (runtime.desktop) {
    if (!desktopInfo?.packaged) return null;
    const updatePhase = desktopUpdate?.phase || "idle";
    if (updatePhase === "idle" || updatePhase === "not-available") return null;
    const percent = desktopUpdate?.percent;
    const version = desktopUpdate?.version || "";

    return (
      <div className="update-toast-container" role="region" aria-label="Update notification">
        <div
          className={`update-toast phase-${updatePhase}`}
          role="status"
          aria-live="polite"
        >
          <div className="update-toast-header">
            <div className="update-toast-head-left">
              <div className="update-toast-icon" aria-hidden="true">🚀</div>
              <div className="update-toast-titles">
                <span className="update-toast-title">
                  {updatePhase === "ready"
                    ? "Update Ready to Install"
                    : updatePhase === "downloading"
                    ? "Downloading Update"
                    : updatePhase === "error"
                    ? "Update Check Notice"
                    : "New Update Available"}
                </span>
                <span className="update-toast-version">
                  Rempeyek Agent OS{version ? ` v${version}` : ""}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="update-toast-close"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss update notification"
            >
              ✕
            </button>
          </div>

          <div className="update-toast-body">
            {updatePhase === "ready" ? (
              <span>
                <b>v{version}</b> is downloaded and verified. Restart the app now to apply the update, or manage in Settings.
              </span>
            ) : updatePhase === "downloading" ? (
              <div>
                <span>Downloading update package v{version}… ({percent || 0}%)</span>
                <div className="update-toast-progress-track">
                  <div
                    className="update-toast-progress-bar"
                    style={{ width: `${percent || 0}%` }}
                  />
                </div>
              </div>
            ) : updatePhase === "error" ? (
              <span>
                Desktop update encountered an issue. You can manage or auto-fix update channels from Settings.
              </span>
            ) : (
              <span>
                A new version <b>v{version}</b> is available. You can download it directly or configure in Settings.
              </span>
            )}
          </div>

          <div className="update-toast-actions">
            {onView && (
              <Btn variant="dim" onClick={handleOpenSettings}>
                Settings
              </Btn>
            )}
            {updatePhase === "ready" ? (
              <Btn variant="primary" onClick={desktopRestart} disabled={desktopBusy}>
                {desktopBusy ? "Restarting…" : "Restart & Apply"}
              </Btn>
            ) : updatePhase === "available" || updatePhase === "error" ? (
              <Btn variant="primary" onClick={desktopDownload} disabled={desktopBusy}>
                {desktopBusy ? "Working…" : "Download"}
              </Btn>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!rel) return null;

  return (
    <div className="update-toast-container" role="region" aria-label="Update notification">
      <div
        className={`update-toast phase-${phase}`}
        role="status"
        aria-live="polite"
      >
        <div className="update-toast-header">
          <div className="update-toast-head-left">
            <div className="update-toast-icon" aria-hidden="true">🚀</div>
            <div className="update-toast-titles">
              <span className="update-toast-title">
                {phase === "done"
                  ? "Update Complete"
                  : phase === "failed"
                  ? "Update Notice"
                  : phase === "updating"
                  ? "Updating System"
                  : "New Version Available"}
              </span>
              <span className="update-toast-version">
                Rempeyek Agent OS v{rel.latest}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="update-toast-close"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update notification"
          >
            ✕
          </button>
        </div>

        <div className="update-toast-body">
          {phase === "done" ? (
            <span>
              <b>Updated to v{rel.latest}.</b> UI assets are live; restart the source server to load backend changes.
            </span>
          ) : phase === "failed" ? (
            <span>
              <b>Update did not complete.</b> Dirty or diverged checkouts stop safely. Manage in Settings.
            </span>
          ) : phase === "updating" ? (
            <span>Applying update v{rel.current} → v{rel.latest}…</span>
          ) : (
            <span>
              <b>v{rel.latest}</b> is available (current: v{rel.current}). Update now or manage in Settings.
            </span>
          )}
        </div>

        <div className="update-toast-actions">
          {rel.notes && phase === "idle" && (
            <button
              type="button"
              className="update-banner-link"
              onClick={() => setShowNotes(v => !v)}
              style={{ marginRight: "auto" }}
            >
              {showNotes ? "hide notes" : "changelog"}
            </button>
          )}
          {onView && (
            <Btn variant="dim" onClick={handleOpenSettings}>
              Settings
            </Btn>
          )}
          {phase === "idle" && (
            <Btn variant="primary" onClick={sourceUpdate}>
              Update Now
            </Btn>
          )}
          {(phase === "done" || phase === "failed") && (
            <Btn variant="dim" onClick={() => setDismissed(true)}>
              Dismiss
            </Btn>
          )}
        </div>

        {showNotes && phase === "idle" && (
          <pre className="update-banner-notes">{rel.notes}</pre>
        )}
        {(phase === "updating" || phase === "failed") && tail.length > 0 && (
          <pre className="update-banner-notes">
            {tail.map(line => (
              `[${line.t}] ${line.s === "err" ? "⚠ " : ""}${line.line}`
            )).join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
