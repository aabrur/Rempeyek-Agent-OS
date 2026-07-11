import { useState } from "react";
import { Btn, Chip, Empty } from "@rempeyek/ui";
import { api } from "../api";
import { obsUri } from "../lib/obsidian";

/** Needs Review = vault Inbox/ notes + open Tasks/ checkboxes.
    The form writes a checkbox into the vault; done writes [x] back. */
export function ReviewPanel({ review, agents, refresh }) {
  const [title, setTitle] = useState("");
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneBusy, setDoneBusy] = useState(null);

  const send = async e => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    const r = await api("/api/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agent || agents[0]?.id, title: t }),
    });
    setBusy(false);
    if (r.error) return alert(r.error);
    setTitle("");
    refresh();
  };

  const markDone = async item => {
    setDoneBusy(item.title);
    const r = await api("/api/task/done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: item.meta, text: item.title }),
    });
    setDoneBusy(null);
    if (r.error) alert(r.error);
    else refresh();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>NEEDS REVIEW</h2>
        <Chip>{review.length} open</Chip>
      </div>

      <form className="task-form" onSubmit={send}>
        <select title="Assign to agent" value={agent} onChange={e => setAgent(e.target.value)}>
          {agents.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>
        <input
          type="text" maxLength={200} autoComplete="off"
          placeholder="Give an agent a task… (Enter to send)"
          value={title} onChange={e => setTitle(e.target.value)}
        />
        <Btn variant="run" type="submit" disabled={busy}>{busy ? "…" : "＋ Send"}</Btn>
      </form>

      <div className="review-list">
        {!review.length && <Empty>Empty — add a note to <b>Inbox/</b> or a checkbox in <b>Tasks/</b> and it shows up here.</Empty>}
        {review.slice(0, 8).map((r, i) => (
          <div key={i} className="review-item">
            <div>
              <span className="t">{r.title}</span>
              <span className={`kind ${r.kind}`}>{r.kind}</span>
              <div className="m">{r.meta}</div>
            </div>
            <div className="review-act">
              {r.kind === "task" && (
                <Btn
                  variant="run" className="btn-mini"
                  disabled={doneBusy === r.title}
                  title="Mark done (writes [x] to the vault)"
                  onClick={() => markDone(r)}
                >
                  {doneBusy === r.title ? "…" : "✓ done"}
                </Btn>
              )}
              <a href={obsUri(r.meta)}>Open in Obsidian</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
