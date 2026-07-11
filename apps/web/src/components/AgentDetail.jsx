import { useEffect, useRef, useState } from "react";
import { Avatar, Btn, Empty, Pill } from "@rempeyek/ui";
import { GatewayControls } from "./GatewayControls";
import { api } from "../api";
import { agentAccent, gwState } from "../lib/agents";
import { obsUri } from "../lib/obsidian";

/** Crop to a square, downscale to 256px, POST as a data URL. */
function useAvatarUpload(onDone) {
  const inputRef = useRef(null);
  const targetRef = useRef(null);

  const pick = id => { targetRef.current = id; inputRef.current?.click(); };

  const onChange = () => {
    const file = inputRef.current.files[0];
    inputRef.current.value = "";
    if (!file || !targetRef.current) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      const S = 256; c.width = S; c.height = S;
      const x = c.getContext("2d");
      const s = Math.min(img.width, img.height);
      x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
      const r = await api(`/api/agent/${targetRef.current}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: c.toDataURL("image/png") }),
      });
      if (r.error) alert(r.error);
      onDone();
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("failed to read the image"); };
    img.src = url;
  };

  const input = <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onChange} />;
  return { pick, input };
}

function Sessions({ activity, isTele, id }) {
  if (!activity.sessions.length) {
    return <Empty>{isTele
      ? <>No activity yet. The agent reports tasks via telemetry <code>telemetry\{id}.jsonl</code> (type <code>task_start/progress/done</code>).</>
      : "No sessions in the last 48 hours."}</Empty>;
  }
  return activity.sessions.map((s, i) => (
    <div key={i} className="sess">
      <div className="top">
        <span>{s.id}{s.project ? ` · ${s.project}` : ""}</span>
        <Pill status={s.status} />
      </div>
      {s.lastPrompt && <div className="prm">❯ {s.lastPrompt}</div>}
      {s.lastTool && <div className="act">⚙ {s.lastTool.name} {s.lastTool.target} · {s.toolCount} tool calls</div>}
    </div>
  ));
}

function Subagents({ activity, isTele }) {
  if (!activity.subagents.length) {
    return <Empty>{isTele
      ? <>No subagents/tasks yet. Report via telemetry (type <code>subagent_start/done</code>) → they appear here automatically.</>
      : "No subagents spawned in the last 48 hours. As soon as an Agent/Task spawn happens, it shows up automatically."}</Empty>;
  }
  return activity.subagents.map((s, i) => (
    <div key={i} className="subrow">
      <span className="ty">{s.type}</span>
      <span className="nm">{s.desc}{s.detail ? ` — ${s.detail}` : ""}</span>
      <span className={`st st-${s.status}`}>{s.status === "done" ? "✔ done" : "⟳ running"}</span>
    </div>
  ));
}

export function AgentDetail({ id, gw, refresh, onClose }) {
  const [d, setD] = useState(null);
  const { pick, input } = useAvatarUpload(() => { load(); refresh(); });
  const logRef = useRef(null);

  const load = async () => setD(await api(`/api/agent/${id}/detail`));

  useEffect(() => {
    setD(null);
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [d]);

  if (!d) return null;
  if (d.error) return <Empty>{d.error}</Empty>;

  const acc = agentAccent(d);
  const st = gwState(d.proc);
  const activity = d.activity || { sessions: [], subagents: [] };
  const isTele = d.source === "telemetry";
  const checked = d.proc?.checkedAt ? new Date(d.proc.checkedAt).toLocaleTimeString("en-GB") : null;

  return (
    <div className="detail" style={{ "--ac": acc }}>
      {input}
      <div className="detail-head">
        <Avatar agent={d} accent={acc} large onEdit={pick} />
        <div>
          <h2>{d.name}</h2>
          <div className="detail-meta">{d.role} · {d.node} · <code>{d.bin || "gateway N/A"}</code></div>
          <div className="pill-row" style={{ marginTop: 7 }}>
            <Pill status={d.vaultStatus} />
            <Pill status={st.cls} label={st.label} title={st.tip} />
          </div>
        </div>
        <div className="detail-actions"><Btn variant="dim" onClick={onClose}>✕ close</Btn></div>
      </div>

      <div className="detail-grid">
        <div className="dsec" style={{ gridColumn: "1/-1" }}>
          <h3>Gateway control {checked && <span className="cnt" style={{ textTransform: "none", letterSpacing: 0 }}>· checked {checked}</span>}</h3>
          <div className="gw-ctl">
            {(d.actions?.length || d.canSummon)
              ? <GatewayControls agent={d} gw={gw} />
              : <span className="muted">{d.note || "no actions"}</span>}
          </div>
          {d.term?.alive
            ? <div className="gw-note" style={{ color: "var(--ac)" }}>
                ⧉ Summoned terminal active — pid {d.term.pid}
                {d.term.startedAt ? ` · since ${String(d.term.startedAt).slice(11, 19)}` : ""} · Stop terminal closes it
              </div>
            : d.term?.pending
              ? <div className="gw-note">⧉ Summoning… waiting for the admin terminal (UAC confirmation)</div>
              : null}
          {d.note && <div className="gw-note">ℹ {d.note}</div>}
          {d.proc?.statusText
            ? <pre className="logpane" style={{ height: 130 }}>{d.proc.statusText}</pre>
            : <Empty>Click <b>Status</b> to check the gateway through its own command.</Empty>}
        </div>

        <div className="dsec">
          <h3>Sessions / Activity <span className="cnt">{activity.sessions.length}</span></h3>
          <div className="dsec-body"><Sessions activity={activity} isTele={isTele} id={d.id} /></div>
        </div>

        <div className="dsec">
          <h3>Subagents / Tasks <span className="cnt">{activity.subagents.length}</span></h3>
          <div className="dsec-body"><Subagents activity={activity} isTele={isTele} /></div>
        </div>

        <div className="dsec">
          <h3>Telemetry <span className="cnt">{d.telemetry.length}</span></h3>
          <div className="dsec-body">
            {d.telemetry.length ? d.telemetry.map((t, i) => (
              <div key={i} className="subrow">
                <span className="ty">{t.type}</span>
                <span className="nm">
                  {t.name || ""}{t.detail ? ` — ${t.detail}` : ""}
                  {t.progress != null && <span className="tele-bar"><i style={{ width: `${Math.min(100, t.progress)}%` }} /></span>}
                </span>
                <span className="st">{(t.ts || "").slice(11, 16)}</span>
              </div>
            )) : <Empty>No telemetry yet. The agent can report progress via <code>telemetry\{d.id}.jsonl</code>.</Empty>}
          </div>
        </div>

        <div className="dsec">
          <h3>Vault lane — Brains/</h3>
          <div className="dsec-body">
            {d.laneFiles.length ? (
              <div className="mini-list">
                {d.laneFiles.map(f => (
                  <a key={f.rel} href={obsUri(f.rel)}>
                    <span>{f.rel.split("/").pop().replace(".md", "")}</span>
                    <span className="d">{f.updated}</span>
                  </a>
                ))}
              </div>
            ) : <Empty>No notes in the Brains lane yet.</Empty>}
          </div>
        </div>

        <div className="dsec" style={{ gridColumn: "1/-1" }}>
          <h3>Gateway run log (owned, live)</h3>
          <pre className="logpane" ref={logRef}>
            {d.log.length
              ? d.log.map(l => `[${l.t}] ${l.s === "err" ? "⚠ " : ""}${l.line}`).join("\n")
              : "(nothing yet — appears when you click Run / foreground)"}
          </pre>
        </div>
      </div>
    </div>
  );
}
