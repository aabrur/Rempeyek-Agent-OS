import { useEffect, useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";
import { apiResponse } from "../api";
import { approveAction } from "../hooks/useGateway";
import {
  normalizeSubagentForm,
  validateSubagentForm,
} from "../lib/subagent-form.mjs";

const BLANK = {
  name: "",
  domain: "",
  outcome: "",
  workspaceScope: "current-project",
  permissionProfile: "standard",
  memoryPolicy: "isolated",
  activation: "manual",
  modelProvider: "",
  allowedPaths: "",
  toolIds: "",
  skillIds: "",
  cadence: "",
  eventTrigger: "",
  checkpointRule: "",
  instructions: "",
};

export function SubagentModal({ open, parent, onClose, onCreated }) {
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(BLANK);
    setErrors({});
    setServerError("");
    setBusy(false);
  }, [open, parent?.id]);

  const set = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async event => {
    event.preventDefault();
    const nextErrors = validateSubagentForm(form);
    setErrors(nextErrors);
    setServerError("");
    if (Object.keys(nextErrors).length) return;

    const values = normalizeSubagentForm(form);
    const approvalId = await approveAction(
      "subagent.create",
      parent.id,
      `Create ${values.name} under ${parent.name || parent.id}.`,
    );
    if (!approvalId) return;

    setBusy(true);
    const response = await apiResponse(`/api/agents/${parent.id}/subagents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        ...values,
      }),
    });
    setBusy(false);
    if (response.status !== 201) {
      setServerError(
        response.body?.error ||
        `Subagent creation returned HTTP ${response.status || "network error"}.`,
      );
      return;
    }
    await onCreated?.(response.body.agent);
    onClose();
  };

  const fieldError = field => errors[field]
    ? <span className="aa-hint err" id={`subagent-${field}-error`}>{errors[field]}</span>
    : null;
  const errorProps = field => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field]
      ? `subagent-${field}-error`
      : undefined,
  });

  return (
    <Overlay
      open={open}
      onClose={close}
      boxClass="aa-box"
      labelledBy="subagent-modal-title"
    >
      <div className="token-title" id="subagent-modal-title">
        + ADD SUBAGENT
      </div>
      <div className="token-sub">
        Create a focused profile under {parent?.name || parent?.id}. It starts
        with manual activation and isolated memory.
      </div>

      <form className="aa-grid" onSubmit={submit}>
        <div className="aa-field">
          <label htmlFor="subagent-name">Name *</label>
          <input
            id="subagent-name"
            autoFocus
            maxLength={60}
            value={form.name}
            onChange={event => set("name", event.target.value)}
            {...errorProps("name")}
          />
          {fieldError("name")}
        </div>
        <div className="aa-field">
          <label htmlFor="subagent-domain">Field / domain *</label>
          <input
            id="subagent-domain"
            maxLength={120}
            value={form.domain}
            onChange={event => set("domain", event.target.value)}
            {...errorProps("domain")}
          />
          {fieldError("domain")}
        </div>
        <div className="aa-field wide">
          <label htmlFor="subagent-outcome">Concrete outcome *</label>
          <input
            id="subagent-outcome"
            maxLength={400}
            value={form.outcome}
            onChange={event => set("outcome", event.target.value)}
            {...errorProps("outcome")}
          />
          {fieldError("outcome")}
        </div>
        <div className="aa-field wide">
          <label htmlFor="subagent-scope">Workspace scope *</label>
          <input
            id="subagent-scope"
            maxLength={120}
            value={form.workspaceScope}
            onChange={event => set("workspaceScope", event.target.value)}
            {...errorProps("workspaceScope")}
          />
          {fieldError("workspaceScope")}
        </div>
        <div className="aa-field">
          <label htmlFor="subagent-permissions">Permission profile</label>
          <select
            id="subagent-permissions"
            value={form.permissionProfile}
            onChange={event => set("permissionProfile", event.target.value)}
          >
            <option value="read-only">Read only</option>
            <option value="standard">Standard</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="aa-field">
          <label htmlFor="subagent-memory">Memory policy</label>
          <select
            id="subagent-memory"
            value={form.memoryPolicy}
            onChange={event => set("memoryPolicy", event.target.value)}
          >
            <option value="isolated">Isolated</option>
            <option value="inherit-summaries">Inherit summaries</option>
            <option value="shared-project">Shared project</option>
          </select>
        </div>
        <div className="aa-field wide">
          <label htmlFor="subagent-activation">Activation</label>
          <select
            id="subagent-activation"
            value={form.activation}
            onChange={event => set("activation", event.target.value)}
          >
            <option value="manual">Manual</option>
            <option value="cadence">Cadence</option>
            <option value="event">Event</option>
          </select>
        </div>

        <div className="aa-field wide">
          <details>
            <summary>Advanced configuration</summary>
            <div className="aa-grid">
              <div className="aa-field">
                <label htmlFor="subagent-provider">Model / provider</label>
                <input
                  id="subagent-provider"
                  value={form.modelProvider}
                  onChange={event => set("modelProvider", event.target.value)}
                />
              </div>
              <div className="aa-field">
                <label htmlFor="subagent-tools">Tools</label>
                <input
                  id="subagent-tools"
                  placeholder="rg, git"
                  value={form.toolIds}
                  onChange={event => set("toolIds", event.target.value)}
                />
              </div>
              <div className="aa-field">
                <label htmlFor="subagent-skills">Skills</label>
                <input
                  id="subagent-skills"
                  placeholder="backend-code-review"
                  value={form.skillIds}
                  onChange={event => set("skillIds", event.target.value)}
                />
              </div>
              <div className="aa-field">
                <label htmlFor="subagent-paths">Allowed paths</label>
                <input
                  id="subagent-paths"
                  placeholder="apps/web, packages/ui"
                  value={form.allowedPaths}
                  onChange={event => set("allowedPaths", event.target.value)}
                />
              </div>
              <div className="aa-field">
                <label htmlFor="subagent-cadence">Cadence</label>
                <input
                  id="subagent-cadence"
                  value={form.cadence}
                  onChange={event => set("cadence", event.target.value)}
                />
              </div>
              <div className="aa-field">
                <label htmlFor="subagent-event">Event trigger</label>
                <input
                  id="subagent-event"
                  value={form.eventTrigger}
                  onChange={event => set("eventTrigger", event.target.value)}
                />
              </div>
              <div className="aa-field wide">
                <label htmlFor="subagent-checkpoint">Checkpoint rule</label>
                <input
                  id="subagent-checkpoint"
                  value={form.checkpointRule}
                  onChange={event => set("checkpointRule", event.target.value)}
                />
              </div>
              <div className="aa-field wide">
                <label htmlFor="subagent-instructions">Instructions</label>
                <input
                  id="subagent-instructions"
                  value={form.instructions}
                  onChange={event => set("instructions", event.target.value)}
                />
              </div>
            </div>
          </details>
        </div>

        <div className="aa-field wide aa-actions">
          <span
            className={`aa-hint ${serverError ? "err" : ""}`.trim()}
            role={serverError ? "alert" : "status"}
            style={{ marginRight: "auto" }}
          >
            {serverError}
          </span>
          <Btn type="button" variant="dim" onClick={close} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" variant="primary" disabled={busy}>
            {busy ? "Creating..." : "+ Create"}
          </Btn>
        </div>
      </form>
    </Overlay>
  );
}
