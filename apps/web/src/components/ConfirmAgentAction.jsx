import { useEffect, useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";

export function ConfirmAgentAction({
  open,
  title,
  agentName,
  impact = [],
  confirmLabel,
  onCancel,
  onConfirm,
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open, agentName]);

  const submit = event => {
    event.preventDefault();
    if (typed === agentName) onConfirm();
  };

  return (
    <Overlay
      open={open}
      onClose={onCancel}
      boxClass="aa-box"
      labelledBy="confirmAgentActionTitle"
    >
      <form onSubmit={submit}>
        <div className="token-title" id="confirmAgentActionTitle">{title}</div>
        <div className="token-sub">
          {impact.map((line, index) => <div key={index}>{line}</div>)}
        </div>
        <div className="aa-field">
          <label htmlFor="confirmAgentName">
            Type <b>{agentName}</b> to confirm
          </label>
          <input
            id="confirmAgentName"
            autoComplete="off"
            value={typed}
            onChange={event => setTyped(event.target.value)}
          />
        </div>
        <div className="aa-actions">
          <Btn type="button" variant="dim" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" variant="stop" disabled={typed !== agentName}>
            {confirmLabel}
          </Btn>
        </div>
      </form>
    </Overlay>
  );
}
