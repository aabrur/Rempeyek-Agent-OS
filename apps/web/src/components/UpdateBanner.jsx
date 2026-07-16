import { useEffect, useRef, useState } from "react";
import { Btn } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";
import { releaseState } from "../../lib/release-check.mjs";

const CHECK_KEY = "aos-release-check";
const CHECK_TTL = 12 * 3600 * 1000;   // one GitHub API call per half-day, not per reload

/** Version-update banner. Silent unless GitHub has a strictly newer release than the local
    /api/version. "Update now" runs `git pull --ff-only && npm install && npm run build` on the
    server — behind the same approval gate as every other mutating action — with a live log tail. */
export function UpdateBanner() {
  const [rel, setRel] = useState(null);          // releaseState result when an update exists
  const [phase, setPhase] = useState("idle");    // idle | updating | done | failed
  const [tail, setTail] = useState([]);
  const [showNotes, setShowNotes] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const v = await api("/api/version");
      if (v.error || !v.repo || !v.version) return;   // no repo remote → nothing to check against
      let cached = null;
      try {
        const c = JSON.parse(localStorage.getItem(CHECK_KEY) || "null");
        if (c && c.repo === v.repo && Date.now() - c.at < CHECK_TTL) cached = c;
      } catch {}
      if (!cached) {
        try {
          const res = await fetch(`https://api.github.com/repos/${v.repo}/releases/latest`,
            { headers: { Accept: "application/vnd.github+json" } });
          if (res.ok) {
            const j = await res.json();
            cached = { at: Date.now(), repo: v.repo, tag: j.tag_name || null, url: j.html_url || "", notes: j.body || "" };
          } else if (res.status === 403 || res.status === 404) {
            cached = { at: Date.now(), repo: v.repo, tag: null };   // no releases yet / rate-limited — stay silent
          }
          if (cached) try { localStorage.setItem(CHECK_KEY, JSON.stringify(cached)); } catch {}
        } catch {}
      }
      if (!alive.current || !cached?.tag) return;
      const s = releaseState({ current: v.version, latestTag: cached.tag, url: cached.url, notes: cached.notes });
      if (s.updateAvailable) setRel(s);
    })();
    return () => { alive.current = false; };
  }, []);

  if (!rel) return null;

  const update = async () => {
    const approvalId = await approveAction("system.update", "dashboard",
      `Update Agent OS ${rel.current} → ${rel.latest}.\nRuns: git pull --ff-only && npm install && npm run build`);
    if (!approvalId) return;
    setPhase("updating"); setTail([]);
    const r = await api("/api/update", { method: "POST", headers: { "x-approval-id": approvalId } });
    if (r.error) { setPhase("failed"); setTail([{ t: "", s: "err", line: r.error }]); return; }
    let since = 0, lines = [];
    for (let i = 0; i < 600 && alive.current; i++) {          // ≤ 15 min
      await new Promise(t => setTimeout(t, 1500));
      const l = await api(`/api/proc/os-update/log?since=${since}`, { timeoutMs: 5000 });
      if (l.lines?.length) { lines = [...lines, ...l.lines]; setTail(lines.slice(-8)); since = l.next; }
      if (l.status && l.status !== "running") break;
    }
    // the server's final sys line is deterministic — read the outcome from it, not a guess
    setPhase(lines.some(l => l.line?.includes("update applied")) ? "done" : "failed");
  };

  return (
    <div className={`update-banner phase-${phase}`} role="status" aria-live="polite">
      <div className="update-banner-row">
        <span className="update-banner-badge" aria-hidden="true">⬆</span>
        {phase === "done" ? (
          <span><b>Updated to v{rel.latest}.</b> UI assets are live — restart the server (`npm start`) to load backend changes.</span>
        ) : phase === "failed" ? (
          <span><b>Update did not complete.</b> Nothing was overwritten — see the log below, or update manually with <code>git pull</code>.</span>
        ) : (
          <span><b>v{rel.latest} tersedia</b> (you run v{rel.current}).</span>
        )}
        {phase === "idle" && <>
          {rel.notes && <button type="button" className="update-banner-link" onClick={() => setShowNotes(s => !s)}>{showNotes ? "hide changelog" : "changelog"}</button>}
          {rel.url && <a className="update-banner-link" href={rel.url} target="_blank" rel="noopener noreferrer">release ↗</a>}
          <Btn variant="primary" onClick={update}>Update now</Btn>
        </>}
        {phase === "updating" && <span className="update-banner-spin">updating…</span>}
      </div>
      {showNotes && phase === "idle" && <pre className="update-banner-notes">{rel.notes}</pre>}
      {(phase === "updating" || phase === "failed") && tail.length > 0 && (
        <pre className="update-banner-notes">{tail.map(l => `[${l.t}] ${l.s === "err" ? "⚠ " : ""}${l.line}`).join("\n")}</pre>
      )}
    </div>
  );
}
