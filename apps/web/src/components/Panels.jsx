import { useState } from "react";
import { Btn, Empty, Panel, Skeleton } from "@rempeyek/ui";
import { agentAccent, TILE_C, WORKFLOWS } from "../lib/agents";
import { api } from "../api";

export function StatTiles({ stats }) {
  return (
    <div className="tiles">
      {Object.values(stats).map((s, i) => (
        <div key={s.label} className="tile" style={{ "--tile-c": TILE_C[i % 4] }}>
          <div className="tile-top"><span>{s.label}</span></div>
          <div className="tile-val">{s.value}</div>
          <div className="tile-sub">live from vault</div>
        </div>
      ))}
    </div>
  );
}

export function WorkflowCards({ workflows, refresh }) {
  const list = (workflows && Array.isArray(workflows) && workflows.length) ? workflows : WORKFLOWS;
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ who: "", t: "", d: "" });
  const [busy, setBusy] = useState(false);

  const startEdit = (w) => {
    setEditingId(w.id);
    setEditForm({ who: w.who, t: w.t, d: w.d });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ who: "", t: "", d: "" });
  };

  const saveEdit = async (id) => {
    setBusy(true);
    const updated = list.map(w => w.id === id ? { ...w, ...editForm } : w);
    const r = await api("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflows: updated }),
    });
    setBusy(false);
    if (r.error) alert(r.error);
    else {
      setEditingId(null);
      refresh?.();
    }
  };

  return (
    <Panel title="PRIMARY WORKFLOWS" chip="routing">
      <div className="workflow-grid">
        {list.map(w => (
          <div key={w.id} className="wf" style={{ "--ac": agentAccent(w.id) }}>
            {editingId === w.id ? (
              <div className="wf-edit-form" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  type="text"
                  value={editForm.who}
                  onChange={e => setEditForm(prev => ({ ...prev, who: e.target.value }))}
                  placeholder="Agent / Label"
                  style={{ background: "var(--bg-card)", color: "var(--fg)", border: "1px solid var(--border)", padding: "4px 8px", borderRadius: 4, fontSize: "0.85rem" }}
                />
                <input
                  type="text"
                  value={editForm.t}
                  onChange={e => setEditForm(prev => ({ ...prev, t: e.target.value }))}
                  placeholder="Workflow Title"
                  style={{ background: "var(--bg-card)", color: "var(--fg)", border: "1px solid var(--border)", padding: "4px 8px", borderRadius: 4, fontSize: "0.85rem" }}
                />
                <textarea
                  value={editForm.d}
                  onChange={e => setEditForm(prev => ({ ...prev, d: e.target.value }))}
                  placeholder="Description"
                  rows={2}
                  style={{ background: "var(--bg-card)", color: "var(--fg)", border: "1px solid var(--border)", padding: "4px 8px", borderRadius: 4, fontSize: "0.8rem", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <Btn variant="run" className="btn-mini" disabled={busy} onClick={() => saveEdit(w.id)}>
                    {busy ? "…" : "✓ Save"}
                  </Btn>
                  <Btn variant="dim" className="btn-mini" onClick={cancelEdit}>
                    Cancel
                  </Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="who" style={{ color: agentAccent(w.id) }}>{w.who}</span>
                  <Btn variant="dim" className="btn-mini" style={{ fontSize: "0.75rem", padding: "2px 6px" }} onClick={() => startEdit(w)}>
                    ✏ edit
                  </Btn>
                </div>
                <div className="t">{w.t}</div>
                <div className="d">{w.d}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const ageLabel = h => h == null ? "-" : h < 1 ? "<1 hour" : h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`;

export function VaultHealth({ health }) {
  return (
    <Panel title="VAULT HEALTH" chip="anti data-loss">
      <div className="vault-health">
        {!health ? <Skeleton />
          : health.error ? <Empty>failed to load vault health</Empty>
            : (
              <>
                <div className="vh-row">
                  <span className={`dot ${!health.gitOk ? "error" : health.gitAgeH > 48 ? "exited" : "running"}`} />
                  <span className="vh-k">Last git commit</span>
                  <span className="vh-v">{health.gitOk ? `${ageLabel(health.gitAgeH)} ago` : "no git init yet"}</span>
                </div>
                <div className="vh-row">
                  <span className={`dot ${health.backupAgeH == null ? "idle" : health.backupAgeH > 48 ? "error" : "running"}`} />
                  <span className="vh-k">Last backup</span>
                  <span className="vh-v">
                    {health.backup == null ? "set BACKUP_PATH"
                      : health.backupAgeH == null ? "not found" : `${ageLabel(health.backupAgeH)} ago`}
                  </span>
                </div>
                <div className="vh-hint">{health.vault}</div>
              </>
            )}
      </div>
    </Panel>
  );
}

export function ScheduleList({ schedule }) {
  return (
    <Panel title="SCHEDULED TASKS" chip="schtasks + config">
      <div className="sched-list">
        {!schedule ? <Skeleton />
          : !schedule.length ? (
            <Empty>
              No scheduled work yet. Add <code>gateway.schtask</code> or <code>cadence</code> on an agent,
              or create Windows Scheduled Tasks that the dashboard can query.
            </Empty>
          )
            : schedule.map(t => (
              <div key={`${t.id}-${t.name || t.source || "row"}`} className="sched-row">
                <span className={`dot ${t.error ? "error" : t.ok === false ? "exited" : "running"}`} />
                <span className="sched-a">{t.icon} {t.agent}</span>
                <span className="sched-d">
                  {t.error
                    ? t.error
                    : t.source === "config"
                      ? `cadence/config: ${t.nextRun || t.name || "-"}`
                      : `last: ${t.lastRun || "-"} · result ${t.lastResult ?? "-"} · next ${t.nextRun || "-"}`}
                </span>
              </div>
            ))}
      </div>
    </Panel>
  );
}

export function ConfigBanner({ configError, stateError }) {
  if (stateError) {
    return (
      <div className="config-banner">
        ⚠ <b>Failed to load state</b>: {stateError}. Try reloading the page; if you use a token, make sure it is correct.
      </div>
    );
  }
  if (!configError) return null;
  return (
    <div className="config-banner">
      ⚠ <b>agents.config.json is broken</b>: using the last valid config. <code>{configError.msg}</code> · fix the file and the dashboard auto-reloads.
    </div>
  );
}
