import { useState } from "react";
import { Btn, Empty, Panel, SectionRow } from "@rempeyek/ui";
import { api } from "../api";
import { PALETTE } from "../lib/agents";
import { obsUri } from "../lib/obsidian";

function BarChart({ days, accent }) {
  const W = 560, H = 170, P = 26;
  const max = Math.max(1, ...days.map(d => d.count));
  const bw = (W - P * 2) / days.length;
  return (
    <svg className="rep-svg" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="gcy" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#0A6E7A" /><stop offset="1" stopColor={accent} />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {days.map((d, i) => {
        const h = Math.round((d.count / max) * (H - 55));
        const x = P + i * bw + 3, y = H - 30 - h;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={bw - 6} height={Math.max(h, 2)} rx="3" fill="url(#gcy)" filter="url(#glow)" />
            <text x={x + (bw - 6) / 2} y={y - 6} fill="#8E88BE" fontSize="9" textAnchor="middle" fontFamily="Cascadia Mono">{d.count || ""}</text>
            <text x={x + (bw - 6) / 2} y={H - 14} fill="#8E88BE" fontSize="8" textAnchor="middle" fontFamily="Cascadia Mono">{d.date.slice(3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ folders }) {
  const total = folders.reduce((s, f) => s + f.count, 0) || 1;
  const R = 62, C = 2 * Math.PI * R;
  let off = 0;
  const segs = folders.map((f, i) => {
    const frac = f.count / total, col = PALETTE[i % PALETTE.length];
    const seg = (
      <circle
        key={f.name} r={R} cx="90" cy="90" fill="none" stroke={col} strokeWidth="20"
        strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`}
        strokeDashoffset={(-off * C).toFixed(1)}
        transform="rotate(-90 90 90)"
      />
    );
    off += frac;
    return seg;
  });
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        {segs}
        <text x="90" y="86" fill="#EEEBFF" fontSize="24" fontWeight="700" textAnchor="middle" fontFamily="Bahnschrift">{total}</text>
        <text x="90" y="104" fill="#8E88BE" fontSize="9" textAnchor="middle" fontFamily="Cascadia Mono">NOTES</text>
      </svg>
      <div className="graph-legend" style={{ margin: 0, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        {folders.map((f, i) => (
          <div key={f.name} className="leg" style={{ color: PALETTE[i % PALETTE.length] }}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />{f.name} · {f.count}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Reports({ accent }) {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setR(await api("/api/report", { timeoutMs: 20000 }));
    setBusy(false);
  };
  const save = async () => {
    const res = await api("/api/report/save", { method: "POST", timeoutMs: 20000 });
    if (res.error) return alert(res.error);
    alert(`Report saved to the vault:\n${res.rel}`);
  };

  const maxT = r ? Math.max(1, ...r.agents.map(a => a.touched7d)) : 1;

  return (
    <>
      <SectionRow label="GENERATOR">
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="primary" onClick={generate} disabled={busy}>{busy ? "…" : "⟳ GENERATE REPORT"}</Btn>
          <Btn variant="run" onClick={save} disabled={!r || r.error}>💾 SAVE TO VAULT</Btn>
        </div>
      </SectionRow>

      {!r ? <Empty>Click <b>GENERATE REPORT</b> to build a report from the current vault state.</Empty>
        : r.error ? <Empty>{r.error}</Empty>
          : (
            <>
              <Panel className="rep-wide" style={{ marginTop: 14 }}>
                <div className="rep-head-stats">
                  <div className="rep-stat"><div className="v">{r.totals.notes}</div><div className="l">notes</div></div>
                  <div className="rep-stat"><div className="v">{r.totals.edges}</div><div className="l">links</div></div>
                  <div className="rep-stat"><div className="v">{r.totals.active7d}</div><div className="l">active 7 days</div></div>
                  <div className="rep-stat"><div className="v">{r.totals.openTasks}</div><div className="l">open tasks</div></div>
                  <div className="rep-stat"><div className="v">{r.totals.gwRunning}</div><div className="l">gateways up</div></div>
                  <div className="rep-stat" style={{ marginLeft: "auto" }}>
                    <div className="l">generated</div>
                    <div className="l" style={{ color: "#EEEBFF" }}>{r.generatedAt.slice(0, 16).replace("T", " ")}</div>
                  </div>
                </div>
              </Panel>

              <div className="report-grid">
                <Panel title="14-DAY ACTIVITY" chip="notes changed/day"><BarChart days={r.days} accent={accent} /></Panel>
                <Panel title="FOLDER DISTRIBUTION"><Donut folders={r.folders} /></Panel>

                <Panel title="AGENT STATUS" className="rep-wide">
                  <table className="rep-table">
                    <tbody>
                      <tr><th>Agent</th><th>Node</th><th>Lane notes</th><th>Active 7d</th><th /><th>Last seen</th><th>Gateway</th></tr>
                      {r.agents.map(a => (
                        <tr key={a.id}>
                          <td>{a.icon} <b>{a.name}</b></td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{a.node}</td>
                          <td>{a.laneNotes}</td>
                          <td>{a.touched7d}</td>
                          <td><div className="rep-bar"><i style={{ width: `${Math.round(a.touched7d / maxT * 100)}%` }} /></div></td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{a.lastSeen || "—"}</td>
                          <td><span className={`lbl-${a.gw === "running" ? "running" : "idle"}`} style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{a.gw}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>

                {r.tasks.length > 0 && (
                  <Panel title="OPEN TASKS" chip={String(r.totals.openTasks)} chipPlain={false} className="rep-wide">
                    <div className="mini-list">
                      {r.tasks.map((t, i) => (
                        <a key={i} href={obsUri(t.source)}>
                          <span>☐ {t.text}</span><span className="d">{t.source}</span>
                        </a>
                      ))}
                    </div>
                  </Panel>
                )}
              </div>
            </>
          )}
    </>
  );
}
