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
  const [stage, setStage] = useState(1);

  useEffect(() => {
    if (open) setStage(1);
  }, [open, agentName]);

  const submit = event => {
    event.preventDefault();
    if (stage === 1) setStage(2);
    else onConfirm();
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
        <div className="aa-field wide" role="status" aria-live="polite">
          <b>
            {stage === 1
              ? `Confirm 1 of 2: ${confirmLabel} for ${agentName}?`
              : "Confirm 2 of 2: this cannot be restored. Continue?"}
          </b>
        </div>
        <div className="aa-actions">
          <Btn type="button" variant="dim" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" variant="stop">
            {stage === 1 ? "Yes, continue" : `Yes, ${confirmLabel}`}
          </Btn>
        </div>
      </form>
    </Overlay>
  );
}
