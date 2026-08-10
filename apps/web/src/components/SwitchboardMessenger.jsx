import { useEffect, useState } from "react";
import { Btn, Empty, Panel, Chip } from "@rempeyek/ui";
import { api } from "../api";

/** Switchboard messenger: send a message to a registered agent; online agents pick it up. */
export function SwitchboardMessenger({ agents = [], refresh }) {
  const [toAgentId, setToAgentId] = useState("");
  const [fromAgentId, setFromAgentId] = useState("user");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [messages, setMessages] = useState([]);

  const load = async () => {
    const r = await api("/api/switchboard/messages");
    if (r?.messages) setMessages(r.messages.slice().reverse().slice(0, 20));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toAgentId && agents[0]?.id) setToAgentId(agents[0].id);
  }, [agents, toAgentId]);

  const send = async e => {
    e.preventDefault();
    const text = message.trim();
    if (!text || !toAgentId) return;
    setBusy(true);
    setHint("");
    const r = await api("/api/switchboard/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAgentId: fromAgentId || "user", toAgentId, message: text }),
    });
    setBusy(false);
    if (r.error) {
      setHint(r.error);
      return;
    }
    setMessage("");
    setHint(`Queued for ${toAgentId}. Online agents read it automatically.`);
    await load();
    refresh?.();
  };

  const markRead = async agentId => {
    await api("/api/switchboard/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    await load();
  };

  const primary = agents.filter(a => a.kind !== "subagent");

  return (
    <Panel title="AGENT MESSAGES" chip="switchboard">
      <form className="task-form" onSubmit={send} style={{ marginBottom: 12 }}>
        <select
          title="From"
          value={fromAgentId}
          onChange={e => setFromAgentId(e.target.value)}
        >
          <option value="user">👤 User</option>
          {primary.map(a => (
            <option key={`from-${a.id}`} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </select>
        <select
          title="To agent"
          value={toAgentId}
          onChange={e => setToAgentId(e.target.value)}
        >
          {primary.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </select>
        <input
          type="text"
          maxLength={4000}
          autoComplete="off"
          placeholder="Message for the agent… (Enter to send)"
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <Btn variant="run" type="submit" disabled={busy || !primary.length}>
          {busy ? "…" : "＋ Send"}
        </Btn>
      </form>
      {!primary.length && (
        <Empty>No registered agents yet. Users add agents themselves from Marketplace / Agents.</Empty>
      )}
      {hint && <div className="aa-hint aa-feedback" role="status">{hint}</div>}
      <div className="review-list">
        {!messages.length && <Empty>No switchboard messages yet.</Empty>}
        {messages.map(m => (
          <div key={m.id} className="review-item">
            <div>
              <span className="t">{m.message}</span>
              <span className={`kind ${m.status === "read" ? "inbox" : "task"}`}>{m.status}</span>
              <div className="m">
                {m.fromAgentId} → {m.toAgentId} · {(m.timestamp || "").slice(0, 19).replace("T", " ")}
              </div>
            </div>
            <div className="review-act">
              {m.status !== "read" && (
                <Btn variant="dim" className="btn-mini" onClick={() => markRead(m.toAgentId)}>
                  mark read
                </Btn>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, opacity: 0.7, fontSize: "0.8rem" }}>
        <Chip>{messages.filter(m => m.status !== "read").length} unread</Chip>
        {" "}Messages land in the agent Brains lane Inbox + Tasks when the agent is online.
      </div>
    </Panel>
  );
}
