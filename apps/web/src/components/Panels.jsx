import { Empty, Panel, Skeleton } from "@rempeyek/ui";
import { agentAccent, TILE_C, WORKFLOWS } from "../lib/agents";

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

export function WorkflowCards() {
  return (
    <Panel title="PRIMARY WORKFLOWS" chip="routing">
      <div className="workflow-grid">
        {WORKFLOWS.map(w => (
          <div key={w.id} className="wf" style={{ "--ac": agentAccent(w.id) }}>
            <span className="who" style={{ color: agentAccent(w.id) }}>{w.who}</span>
            <div className="t">{w.t}</div>
            <div className="d">{w.d}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const ageLabel = h => h == null ? "—" : h < 1 ? "<1 hour" : h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`;

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
    <Panel title="SCHEDULED TASKS" chip="schtasks">
      <div className="sched-list">
        {!schedule ? <Skeleton />
          : !schedule.length ? <Empty>No agents with a <code>schtask</code> in the config.</Empty>
            : schedule.map(t => (
              <div key={t.id} className="sched-row">
                <span className={`dot ${t.error ? "error" : t.ok ? "running" : "exited"}`} />
                <span className="sched-a">{t.icon} {t.agent}</span>
                <span className="sched-d">
                  {t.error ? t.error : `last: ${t.lastRun || "—"} · result ${t.lastResult ?? "—"} · next ${t.nextRun || "—"}`}
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
        ⚠ <b>Failed to load state</b> — {stateError}. Try reloading the page; if you use a token, make sure it is correct.
      </div>
    );
  }
  if (!configError) return null;
  return (
    <div className="config-banner">
      ⚠ <b>agents.config.json is broken</b> — using the last valid config. <code>{configError.msg}</code> · fix the file and the dashboard auto-reloads.
    </div>
  );
}
