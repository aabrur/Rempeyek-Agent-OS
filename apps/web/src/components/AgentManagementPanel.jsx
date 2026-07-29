import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Panel, Pill, Overlay } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";
import {
  agentManagementRows,
  removalImpact,
} from "../lib/agent-management-view.mjs";
import { ConfirmAgentAction } from "./ConfirmAgentAction";

const operationId = () => crypto.randomUUID();
const noExtraConfirmation = () => true;

function stateStatus(value) {
  if (value === "active" || value === "installed") return "running";
  if (value === "disabled" || value === "not_installed") return "error";
  return "idle";
}

/** Positioned dropdown that appears next to the ⋯ trigger. */
function ActionMenu({ row, busy, onAction, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = event => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const handleEscape = event => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div className="aa-dropdown" ref={ref} role="menu" aria-label={`Actions for ${row.name}`}>
      {row.actions.map(action => (
        <button
          key={action}
          role="menuitem"
          className={`aa-dropdown-item${action === "remove" || action === "uninstall" ? " aa-dropdown-danger" : ""}`}
          disabled={Boolean(busy)}
          onClick={() => { onAction(row, action); onClose(); }}
        >
          {busy === `${row.id}:${action}` ? "…" : action}
        </button>
      ))}
    </div>
  );
}

export function AgentManagementPanel({ state, refresh }) {
  const [busy, setBusy] = useState(null);
  const [hint, setHint] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const allRows = useMemo(
    () => agentManagementRows(state?.agents || []),
    [state],
  );
  const rows = useMemo(
    () => allRows
      .filter(row => row.kind !== "subagent")
      .filter(row => row.profile !== "absent" || row.software === "installed"),
    [allRows],
  );

  const finish = async response => {
    setBusy(null);
    if (response?.error) {
      setHint(response.error);
      return false;
    }
    setHint("");
    await refresh?.();
    return true;
  };

  const patchEnabled = async (row, enabled) => {
    const type = enabled ? "agent.enable" : "agent.disable";
    const approvalId = await approveAction(
      type,
      row.id,
      `${enabled ? "Enable" : "Disable"} the ${row.name} profile.`,
    );
    if (!approvalId) return;
    setBusy(`${row.id}:${enabled ? "enable" : "disable"}`);
    await finish(await api(`/api/agents/${row.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({ operationId: operationId(), enabled }),
    }));
  };

  const activate = async row => {
    const approvalId = await approveAction(
      "agent.activate",
      row.id,
      `Make ${row.name} the active agent profile.`,
    );
    if (!approvalId) return;
    setBusy(`${row.id}:activate`);
    await finish(await api(`/api/agents/${row.id}/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({ operationId: operationId() }),
    }));
  };

  const saveEdit = async event => {
    event.preventDefault();
    const row = editing;
    const approvalId = await approveAction(
      "agent.edit",
      row.id,
      `Update the editable profile fields for ${row.name}.`,
    );
    if (!approvalId) return;
    setBusy(`${row.id}:edit`);
    const response = await api(`/api/agents/${row.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        operationId: operationId(),
        name: row.name,
        role: row.role,
        note: row.note,
      }),
    });
    if (await finish(response)) setEditing(null);
  };

  const openRemoval = row => {
    const children = allRows.filter(candidate => candidate.parentId === row.id);
    const impact = removalImpact(row, children);
    setConfirming({
      kind: "remove",
      row,
      detachChildren: false,
      impact: [
        `Profile only: ${row.name}.`,
        `Retained outside the profile: ${impact.retained.join(", ")}.`,
        "The profile disappears permanently and no Restore card is created.",
        ...(impact.childIds.length
          ? [`Child profiles block removal: ${impact.childIds.join(", ")}.`]
          : []),
      ],
    });
  };

  const remove = async action => {
    setConfirming(null);
    const row = action.row;
    const first = await approveAction(
      "agent.remove",
      row.id,
      `Remove the ${row.name} profile while retaining user data.`,
      noExtraConfirmation,
    );
    if (!first) return;
    const second = await approveAction(
      "agent.remove.confirm",
      row.id,
      `Confirm permanent removal of ${row.name}.`,
      noExtraConfirmation,
    );
    if (!second) return;
    setBusy(`${row.id}:remove`);
    const response = await api(`/api/agents/${row.id}/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": first,
        "x-confirmation-id": second,
      },
      body: JSON.stringify({
        operationId: operationId(),
        detachChildren: action.detachChildren === true,
      }),
    });
    setBusy(null);
    if (response.childIds?.length && action.detachChildren !== true) {
      setConfirming({
        kind: "remove",
        row,
        detachChildren: true,
        impact: [
          `Detach and disable children: ${response.childIds.join(", ")}.`,
          "Then remove only the primary profile.",
          "Vault, telemetry, workflows, logs, credentials, software, and user files stay retained.",
        ],
      });
      return;
    }
    await finish(response);
  };

  const openUninstall = row => {
    const childIds = allRows
      .filter(candidate => candidate.parentId === row.id)
      .map(candidate => candidate.id);
    if (childIds.length) {
      setHint(`Remove or detach child profiles before uninstall: ${childIds.join(", ")}.`);
      return;
    }
    setConfirming({
      kind: "uninstall",
      row,
      impact: [
        `Uninstall software for ${row.name}.`,
        "After verified uninstall success, its Rempeyek profile disappears permanently.",
        "Vault and user-owned data remain outside the profile.",
      ],
    });
  };

  const uninstall = async action => {
    setConfirming(null);
    const row = action.row;
    const first = await approveAction(
      "agent.uninstall",
      row.id,
      `Approve uninstalling ${row.name} software.`,
      noExtraConfirmation,
    );
    if (!first) return;
    const second = await approveAction(
      "agent.uninstall.confirm",
      row.id,
      `Confirm the software impact for ${row.name}.`,
      noExtraConfirmation,
    );
    if (!second) return;
    setBusy(`${row.id}:uninstall`);
    await finish(await api(`/api/agents/${row.id}/uninstall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": first,
        "x-confirmation-id": second,
      },
      body: JSON.stringify({ operationId: operationId() }),
    }));
  };

  const runAction = (row, action) => {
    if (action === "edit") setEditing({ ...row });
    else if (action === "enable") patchEnabled(row, true);
    else if (action === "disable") patchEnabled(row, false);
    else if (action === "activate") activate(row);
    else if (action === "remove") openRemoval(row);
    else if (action === "uninstall") openUninstall(row);
  };

  return (
    <>
      <Panel title="AGENTS" chip={`${rows.length} managed`}>
        <div className="aa-catalog" role="list" aria-label="Agent management">
          {rows.map(row => (
            <div className="aa-cat-card" role="listitem" key={row.id}>
              <span className="aa-cat-icon" aria-hidden="true">
                {row.name?.slice(0, 1) || "A"}
              </span>
              <div className="aa-cat-body">
                <b>{row.name}</b>
                <small>{row.role || row.id}</small>
                <span>
                  {row.badges.map(badge => (
                    <Pill key={badge} status={stateStatus(badge)} label={badge} />
                  ))}
                </span>
              </div>
              <div className="aa-menu-wrap">
                <button
                  className="aa-menu-trigger"
                  aria-label={`Actions for ${row.name}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === row.id}
                  onClick={event => {
                    event.stopPropagation();
                    setOpenMenu(openMenu === row.id ? null : row.id);
                  }}
                >
                  ⋯
                </button>
                {openMenu === row.id && (
                  <ActionMenu
                    row={row}
                    busy={busy}
                    onAction={runAction}
                    onClose={() => setOpenMenu(null)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {hint && <span className="aa-hint err" role="alert">{hint}</span>}
      </Panel>

      <Overlay
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        boxClass="aa-box"
        labelledBy="editAgentTitle"
      >
        {editing && (
          <form className="aa-grid" onSubmit={saveEdit}>
            <div className="token-title" id="editAgentTitle">EDIT AGENT</div>
            <div className="aa-field">
              <label htmlFor="manageAgentName">Name</label>
              <input
                id="manageAgentName"
                maxLength={40}
                value={editing.name}
                onChange={event => setEditing({ ...editing, name: event.target.value })}
              />
            </div>
            <div className="aa-field">
              <label htmlFor="manageAgentRole">Role</label>
              <input
                id="manageAgentRole"
                maxLength={80}
                value={editing.role || ""}
                onChange={event => setEditing({ ...editing, role: event.target.value })}
              />
            </div>
            <div className="aa-field wide">
              <label htmlFor="manageAgentNote">Note</label>
              <textarea
                id="manageAgentNote"
                maxLength={400}
                value={editing.note || ""}
                onChange={event => setEditing({ ...editing, note: event.target.value })}
              />
            </div>
            <div className="aa-field wide aa-actions">
              <Btn type="button" variant="dim" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn type="submit" variant="primary" disabled={Boolean(busy)}>Save</Btn>
            </div>
          </form>
        )}
      </Overlay>

      <ConfirmAgentAction
        open={Boolean(confirming)}
        title={confirming?.kind === "uninstall" ? "UNINSTALL AGENT SOFTWARE" : "REMOVE AGENT PROFILE"}
        agentName={confirming?.row?.name || ""}
        impact={confirming?.impact || []}
        confirmLabel={
          confirming?.kind === "uninstall"
            ? "Uninstall software"
            : confirming?.detachChildren
              ? "Detach children and remove profile"
              : "Remove profile"
        }
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming?.kind === "uninstall"
          ? uninstall(confirming)
          : remove(confirming)}
      />
    </>
  );
}
