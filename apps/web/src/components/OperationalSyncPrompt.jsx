import { useEffect, useRef, useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";
import { api } from "../api";

function operationId() {
  return `sync-all-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}

export function OperationalSyncPrompt() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const textRef = useRef(null);
  const operationRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(null);
    setMessage("Loading the runtime-injected contract…");
    setConfirming(false);
    operationRef.current = operationId();
    api("/api/agents/synchronization-prompt").then(result => {
      if (!active) return;
      if (result?.error) {
        setMessage(`Could not load the prompt: ${result.error}`);
        return;
      }
      setData(result);
      setMessage(
        `${result.recipients} registered primary agent${result.recipients === 1 ? "" : "s"} ready. Subagents remain inside their owner profiles.`,
      );
    });
    return () => { active = false; };
  }, [open]);

  const close = () => {
    if (sending) return;
    setOpen(false);
    setConfirming(false);
  };

  const copyPrompt = async () => {
    if (!data?.prompt) return;
    try {
      await navigator.clipboard.writeText(data.prompt);
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      if (!document.execCommand?.("copy")) {
        setMessage("Clipboard access was blocked. Select the prompt and copy it manually.");
        return;
      }
    }
    setMessage("Prompt copied. Paste it into the target agent.");
  };

  const sendToAll = async () => {
    if (!data?.prompt || sending) return;
    if (!confirming) {
      setConfirming(true);
      setMessage(`Confirm sending one synchronization task to ${data.recipients} primary agents.`);
      return;
    }
    setSending(true);
    setMessage("Writing the shared contract and agent tasks…");
    const result = await api("/api/agents/synchronization-prompt/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: operationRef.current }),
    });
    setSending(false);
    if (result?.error) {
      setMessage(`Send failed: ${result.error}`);
      return;
    }
    setConfirming(false);
    setMessage(
      `Sent to ${result.sent} primary agents through ${result.taskRel}. No subagent was spawned.`,
    );
  };

  return (
    <>
      <section className="sync-prompt-card" aria-labelledby="sync-prompt-card-title">
        <div>
          <div className="ws-eyebrow">REMPEYEK COMMAND CONTRACT</div>
          <h2 id="sync-prompt-card-title">Full Agent Synchronization</h2>
          <p>
            Runtime-injected prompt for aligning identity, Vault, shared memory,
            skills, tasks, evidence, and Graphify.
          </p>
        </div>
        <Btn variant="primary" onClick={() => setOpen(true)}>Open sync prompt</Btn>
      </section>

      <Overlay
        open={open}
        onClose={close}
        boxClass="sync-prompt-box"
        labelledBy="sync-prompt-title"
      >
        <div className="sync-prompt-head">
          <div>
            <div className="ws-eyebrow">OPERATIONAL SYNCHRONIZATION</div>
            <h2 id="sync-prompt-title">Copy or send the full contract</h2>
          </div>
          <Btn type="button" onClick={close} disabled={sending}>Close</Btn>
        </div>
        <p className="sync-prompt-summary">
          Paths are resolved by the local backend. The contract never creates
          another Vault, scans the whole PC, or sends a separate task to subagents.
        </p>
        <textarea
          ref={textRef}
          className="sync-prompt-text"
          readOnly
          spellCheck="false"
          value={data?.prompt || ""}
          aria-label="Operational synchronization prompt"
        />
        <div className="aa-hint" role="status" aria-live="polite">{message}</div>
        <div className="aa-actions sync-prompt-actions">
          <Btn type="button" onClick={copyPrompt} disabled={!data?.prompt || sending}>
            Copy prompt
          </Btn>
          <Btn
            type="button"
            variant={confirming ? "stop" : "primary"}
            onClick={sendToAll}
            disabled={!data?.prompt || sending}
          >
            {sending
              ? "Sending…"
              : confirming
                ? `Confirm send to ${data?.recipients || 0}`
                : "Send to all agents"}
          </Btn>
        </div>
      </Overlay>
    </>
  );
}
