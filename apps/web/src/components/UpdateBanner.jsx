import { useEffect, useRef, useState } from "react";
import { Btn } from "@rempeyek/ui";
import { api } from "../api";
import { desktopRuntime } from "../lib/desktop-runtime.mjs";
import { approveAction } from "../hooks/useGateway";
import { releaseState } from "../../lib/release-check.mjs";

const CHECK_KEY = "aos-release-check";
const CHECK_TTL = 12 * 3600 * 1000;

export function UpdateBanner() {
  const [runtime] = useState(() => desktopRuntime(
    globalThis.window?.rempeyekDesktop,
  ));
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [desktopUpdate, setDesktopUpdate] = useState(null);
  const [desktopBusy, setDesktopBusy] = useState(false);
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
      }).catch(error => {
        if (alive.current) {
          setDesktopUpdate({ phase: "error", error: error.message });
        }
      });
      const unsubscribe = runtime.onUpdateState(value => {
        if (alive.current) setDesktopUpdate(value);
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
      if (state.updateAvailable) setRel(state);
    })();
    return () => {
      alive.current = false;
    };
  }, [runtime]);

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

  const desktopAction = async () => {
    setDesktopBusy(true);
    try {
      if (desktopUpdate?.phase === "ready") {
        await runtime.restartToUpdate();
      } else {
        const next = await runtime.checkForUpdates();
        if (next) setDesktopUpdate(next);
      }
    } catch (error) {
      setDesktopUpdate({
        ...desktopUpdate,
        phase: "error",
        error: error.message,
      });
    } finally {
      setDesktopBusy(false);
    }
  };

  if (runtime.desktop) {
    if (!desktopInfo?.packaged) return null;
    const updatePhase = desktopUpdate?.phase || "idle";
    if (updatePhase === "idle" || updatePhase === "not-available") return null;
    const percent = desktopUpdate?.percent;
    return (
      <div
        className={`update-banner phase-${updatePhase}`}
        role="status"
        aria-live="polite"
      >
        <div className="update-banner-row">
          <span className="update-banner-badge" aria-hidden="true">⬆</span>
          {updatePhase === "ready" ? (
            <span>
              <b>v{desktopUpdate.version} is verified and ready.</b>{" "}
              Restart is a separate user action.
            </span>
          ) : updatePhase === "downloading" ? (
            <span>
              <b>Downloading v{desktopUpdate.version || "update"}.</b>{" "}
              {Number.isFinite(percent) ? `${percent}%` : ""}
            </span>
          ) : updatePhase === "error" ? (
            <span>
              <b>Desktop update check failed.</b>{" "}
              {desktopUpdate.error || "Try again from Settings."}
            </span>
          ) : (
            <span>
              <b>
                {updatePhase === "checking"
                  ? "Checking for a verified desktop update."
                  : `v${desktopUpdate.version} is available.`}
              </b>
            </span>
          )}
          {(updatePhase === "ready" || updatePhase === "error") && (
            <Btn
              variant="primary"
              disabled={desktopBusy}
              onClick={desktopAction}
            >
              {desktopBusy
                ? "Working…"
                : updatePhase === "ready"
                  ? "Restart to update"
                  : "Check again"}
            </Btn>
          )}
          {(updatePhase === "checking" || updatePhase === "downloading") && (
            <span className="update-banner-spin">
              {updatePhase === "checking" ? "checking…" : "downloading…"}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!rel) return null;
  return (
    <div
      className={`update-banner phase-${phase}`}
      role="status"
      aria-live="polite"
    >
      <div className="update-banner-row">
        <span className="update-banner-badge" aria-hidden="true">⬆</span>
        {phase === "done" ? (
          <span>
            <b>Updated to v{rel.latest}.</b> UI assets are live; restart the
            source server to load backend changes.
          </span>
        ) : phase === "failed" ? (
          <span>
            <b>Update did not complete.</b> Dirty or diverged checkouts stop
            before changes are applied.
          </span>
        ) : (
          <span>
            <b>v{rel.latest} tersedia</b> (you run v{rel.current}).
          </span>
        )}
        {phase === "idle" && (
          <>
            {rel.notes && (
              <button
                type="button"
                className="update-banner-link"
                onClick={() => setShowNotes(value => !value)}
              >
                {showNotes ? "hide changelog" : "changelog"}
              </button>
            )}
            {rel.url && (
              <a
                className="update-banner-link"
                href={rel.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                release ↗
              </a>
            )}
            <Btn variant="primary" onClick={sourceUpdate}>Update now</Btn>
          </>
        )}
        {phase === "updating" && (
          <span className="update-banner-spin">updating…</span>
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
  );
}
