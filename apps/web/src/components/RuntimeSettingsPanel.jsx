import { useEffect, useState } from "react";
import { Btn, Panel } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";
import { ConfirmAgentAction } from "./ConfirmAgentAction";

const operationId = () => crypto.randomUUID();

export function RuntimeSettingsPanel({ desktop = null }) {
  const [snapshot, setSnapshot] = useState(null);
  const [retention, setRetention] = useState(30);
  const [anonymousTelemetry, setAnonymousTelemetry] = useState(false);
  const [busy, setBusy] = useState("");
  const [hint, setHint] = useState("");
  const [confirming, setConfirming] = useState(null);

  const load = async () => {
    const value = await api("/api/settings/runtime");
    if (value?.error) {
      setHint(value.error);
      return value;
    }
    setSnapshot(value);
    setRetention(value.settings?.logRetentionDays ?? 30);
    setAnonymousTelemetry(Boolean(value.settings?.anonymousTelemetry));
    setHint("");
    return value;
  };

  useEffect(() => {
    let alive = true;
    api("/api/settings/runtime").then(value => {
      if (!alive) return;
      if (value?.error) return setHint(value.error);
      setSnapshot(value);
      setRetention(value.settings?.logRetentionDays ?? 30);
      setAnonymousTelemetry(Boolean(value.settings?.anonymousTelemetry));
    });
    return () => { alive = false; };
  }, []);

  const save = async () => {
    const approvalId = await approveAction(
      "settings.runtime",
      "runtime",
      "Save log retention and anonymous telemetry preferences.",
    );
    if (!approvalId) return;
    setBusy("save");
    const response = await api("/api/settings/runtime", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        operationId: operationId(),
        logRetentionDays: Number(retention),
        anonymousTelemetry,
      }),
    });
    setBusy("");
    if (response?.error) return setHint(response.error);
    setSnapshot(response);
    setHint("Runtime preferences saved.");
  };

  const restoreBackup = async () => {
    setConfirming(null);
    const approvalId = await approveAction(
      "settings.restore-backup",
      "registry",
      "Restore the previous agent registry backup.",
    );
    if (!approvalId) return;
    setBusy("restore");
    const response = await api("/api/settings/restore-backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        operationId: operationId(),
        agencyName: snapshot.agency,
      }),
    });
    setBusy("");
    if (response?.error) return setHint(response.error);
    setSnapshot(response);
    setRetention(response.settings.logRetentionDays);
    setAnonymousTelemetry(response.settings.anonymousTelemetry);
    setHint("Registry backup restored. The replaced state is now the next backup.");
  };

  const clearLogs = async () => {
    setConfirming(null);
    const approvalId = await approveAction(
      "settings.clear-logs",
      "owned-logs",
      `Clear these owned logs: ${(snapshot.logFiles || []).join(", ") || "none"}.`,
    );
    if (!approvalId) return;
    setBusy("logs");
    const response = await api("/api/settings/clear-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        operationId: operationId(),
        names: snapshot.logFiles || [],
      }),
    });
    setBusy("");
    if (response?.error) {
      setHint(response.error);
      await load();
      return;
    }
    await load();
    setHint(`Cleared ${response.removed?.length || 0} owned log files.`);
  };

  const resetUi = () => {
    for (const key of ["aos-theme", "aos-release-check", "dashToken"]) {
      localStorage.removeItem(key);
    }
    setConfirming(null);
    setHint("UI preferences reset. Reload to apply the default theme.");
  };

  const openFolder = async kind => {
    setHint("");
    try {
      const error = await desktop.openPath(kind);
      if (error) setHint(error);
    } catch (error) {
      setHint(error.message);
    }
  };

  if (!snapshot) {
    return (
      <Panel title="STORAGE & RECOVERY" chip="loading">
        <p className="settings-note" role={hint ? "alert" : undefined}>
          {hint || "Loading runtime settings…"}
        </p>
      </Panel>
    );
  }

  const backup = snapshot.backups?.[0];
  const providers = snapshot.providerVariables || [];

  return (
    <>
      <Panel title="STORAGE & RECOVERY" chip="local state">
        <div className="settings-facts">
          <div><span>STATE ROOT</span><b title={snapshot.paths.stateRoot}>{snapshot.paths.stateRoot}</b></div>
          <div><span>VAULT</span><b title={snapshot.paths.vaultPath}>{snapshot.paths.vaultPath}</b></div>
          <div><span>LOG FOLDER</span><b title={snapshot.paths.logDir}>{snapshot.paths.logDir}</b></div>
          <div><span>REGISTRY BACKUP</span><b>{backup ? backup.name : "not available"}</b></div>
          <div><span>OWNED LOG FILES</span><b>{snapshot.logFiles?.length || 0}</b></div>
        </div>
        <div className="aa-actions">
          {desktop?.desktop && (
            <>
              <Btn variant="dim" onClick={() => openFolder("state")}>
                Open State
              </Btn>
              <Btn variant="dim" onClick={() => openFolder("vault")}>
                Open Vault
              </Btn>
              <Btn variant="dim" onClick={() => openFolder("logs")}>
                Open Logs
              </Btn>
            </>
          )}
          <Btn
            variant="dim"
            disabled={!backup || Boolean(busy)}
            onClick={() => setConfirming({
              kind: "restore",
              name: snapshot.agency,
              impact: [
                `Restore ${backup?.name || "the previous registry"}.`,
                "The current registry becomes the next backup.",
                "Vault, telemetry, workflows, credentials, and user files are unchanged.",
              ],
            })}
          >
            {busy === "restore" ? "Restoring…" : "Restore Backup"}
          </Btn>
          <Btn
            variant="stop"
            disabled={!snapshot.logFiles?.length || Boolean(busy)}
            onClick={() => setConfirming({
              kind: "logs",
              name: "CLEAR LOGS",
              impact: [
                `Delete only: ${(snapshot.logFiles || []).join(", ")}.`,
                "No folders, telemetry JSONL, vault notes, or user files are removed.",
              ],
            })}
          >
            {busy === "logs" ? "Clearing…" : "Clear Logs"}
          </Btn>
        </div>
      </Panel>

      <Panel title="PRIVACY & EXECUTION" chip="local controls">
        <div className="settings-facts">
          <div>
            <span>LOG RETENTION DAYS</span>
            <input
              aria-label="Log retention days"
              type="number"
              inputMode="numeric"
              min="1"
              max="365"
              value={retention}
              onChange={event => setRetention(event.target.value)}
            />
          </div>
          <div>
            <span>ANONYMOUS TELEMETRY</span>
            <label>
              <input
                type="checkbox"
                checked={anonymousTelemetry}
                onChange={event => setAnonymousTelemetry(event.target.checked)}
              />{" "}
              {anonymousTelemetry ? "Enabled" : "Off by default"}
            </label>
          </div>
          <div>
            <span>PROVIDER VARIABLES</span>
            <b>{providers.length
              ? providers.map(item => `${item.name}: ${item.detected ? "detected" : "missing"}`).join(" · ")
              : "none configured"}</b>
          </div>
          <div><span>APPROVAL AUDIT EVENTS</span><b>{snapshot.approvalAuditCount}</b></div>
        </div>
        <div className="aa-actions">
          <Btn variant="dim" onClick={() => window.open("/api/diagnostics", "_blank", "noopener")}>
            Download Diagnostics
          </Btn>
          <Btn
            variant="dim"
            onClick={() => setConfirming({
              kind: "reset",
              name: "RESET UI",
              impact: [
                "Remove only theme, release-check cache, and dashboard token preferences.",
                "No server, registry, vault, telemetry, or agent data is changed.",
              ],
            })}
          >
            Reset UI Preferences
          </Btn>
          <Btn variant="primary" disabled={Boolean(busy)} onClick={save}>
            {busy === "save" ? "Saving…" : "Save Runtime Settings"}
          </Btn>
        </div>
        {hint && <p className="settings-note" role="status">{hint}</p>}
      </Panel>

      <ConfirmAgentAction
        open={Boolean(confirming)}
        title={
          confirming?.kind === "restore"
            ? "RESTORE REGISTRY BACKUP"
            : confirming?.kind === "logs"
              ? "CLEAR OWNED LOGS"
              : "RESET UI PREFERENCES"
        }
        agentName={confirming?.name || ""}
        impact={confirming?.impact || []}
        confirmLabel={
          confirming?.kind === "restore"
            ? "Restore backup"
            : confirming?.kind === "logs"
              ? "Clear logs"
              : "Reset preferences"
        }
        onCancel={() => setConfirming(null)}
        onConfirm={
          confirming?.kind === "restore"
            ? restoreBackup
            : confirming?.kind === "logs"
              ? clearLogs
              : resetUi
        }
      />
    </>
  );
}
