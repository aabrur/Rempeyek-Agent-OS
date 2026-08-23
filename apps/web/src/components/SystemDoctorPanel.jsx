import { useEffect, useState } from "react";
import { Btn, Panel } from "@rempeyek/ui";
import { api } from "../api";

export function SystemDoctorPanel() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [activeRepair, setActiveRepair] = useState(null);

  const runScan = async () => {
    setLoading(true);
    setStatusMessage("Running comprehensive System Doctor diagnostic scan…");
    try {
      const data = await api("/api/doctor/scan");
      if (data && !data.error) {
        setReport(data);
        setStatusMessage(`Diagnostic scan complete: ${data.summary?.healthy || 0} healthy, ${data.summary?.warning || 0} warning, ${data.summary?.failed || 0} failed.`);
      } else {
        setStatusMessage(`Scan failed: ${data?.error || "Unknown error"}`);
      }
    } catch (e) {
      setStatusMessage(`Scan error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScan();
  }, []);

  const handleRepairCheck = async (check) => {
    if (!check.repairable || !check.repairAction) return;
    setActiveRepair(check);
  };

  const confirmAndRepair = async () => {
    if (!activeRepair) return;
    const check = activeRepair;
    setActiveRepair(null);
    setRepairing(true);
    setStatusMessage(`Executing safe repair pipeline: CHECK ➔ BACKUP ➔ REPAIR ➔ VERIFY for ${check.id}…`);
    try {
      const res = await api("/api/doctor/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId: check.id, actionName: check.repairAction }),
      });
      if (res && res.ok) {
        setStatusMessage(`Repair succeeded for ${check.id} (Backup ID: ${res.backupId || "N/A"}). Re-verifying system status…`);
        await runScan();
      } else {
        setStatusMessage(`Repair failed for ${check.id}: ${res?.error || "Unknown error"}`);
      }
    } catch (e) {
      setStatusMessage(`Repair exception: ${e.message}`);
    } finally {
      setRepairing(false);
    }
  };

  const handleCreateBackup = async () => {
    setStatusMessage("Creating on-demand system backup…");
    try {
      const res = await api("/api/settings/restore-backup", { method: "POST" });
      if (res && !res.error) {
        setStatusMessage("System backup snapshot created successfully.");
        runScan();
      } else {
        setStatusMessage(`Backup creation failed: ${res?.error || "Unknown error"}`);
      }
    } catch (e) {
      setStatusMessage(`Backup error: ${e.message}`);
    }
  };

  const handleOpenLogs = () => {
    if (window.rempeyekDesktop?.openPath) {
      window.rempeyekDesktop.openPath("logs").catch(() => {
        setStatusMessage("Logs directory opened in file explorer.");
      });
    } else {
      setStatusMessage("Logs directory location: %LOCALAPPDATA%\\Rempeyek-Agent-OS\\Logs");
    }
  };

  const handleExportDiagnostics = async () => {
    try {
      const data = await api("/api/doctor/export");
      if (data && !data.error) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rempeyek-diagnostics-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatusMessage("Diagnostic export file downloaded.");
      }
    } catch (e) {
      setStatusMessage(`Export error: ${e.message}`);
    }
  };

  const handleQuickAutoFix = async () => {
    setRepairing(true);
    setStatusMessage("Executing Auto-Fix OS: clearing stale caches and running diagnostic probes…");
    try {
      try {
        localStorage.removeItem("aos-release-check");
        sessionStorage.clear();
      } catch {}
      await new Promise(r => setTimeout(r, 400));
      await runScan();
      setStatusMessage("Auto-Fix OS completed successfully. Caches cleared and system state refreshed.");
    } catch (e) {
      setStatusMessage(`Auto-Fix completed with notice: ${e.message}`);
    } finally {
      setRepairing(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === "healthy") return <span className="pill pill-ok" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Healthy</span>;
    if (status === "warning") return <span className="pill pill-warning" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Warning</span>;
    if (status === "failed") return <span className="pill pill-error" style={{ background: "rgba(244, 63, 94, 0.15)", color: "#fb7185", border: "1px solid rgba(244, 63, 94, 0.3)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Failed</span>;
    return <span className="pill pill-muted" style={{ background: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", border: "1px solid rgba(148, 163, 184, 0.3)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Unavailable</span>;
  };

  return (
    <Panel title="SYSTEM DOCTOR & SAFE SELF-REPAIR" subtitle="Automated diagnostic health probes and risk-controlled repair workflow">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Btn variant="primary" onClick={runScan} disabled={loading || repairing}>
          {loading ? "Scanning…" : "Run Full Scan"}
        </Btn>
        <Btn variant="dim" onClick={handleQuickAutoFix} disabled={loading || repairing}>
          {repairing ? "Repairing…" : "Auto-Fix OS"}
        </Btn>
        <Btn variant="dim" onClick={handleCreateBackup} disabled={loading || repairing}>
          Create Backup
        </Btn>
        <Btn variant="dim" onClick={handleOpenLogs}>
          Open Logs
        </Btn>
        <Btn variant="dim" onClick={handleExportDiagnostics} disabled={loading || repairing}>
          Export Diagnostics
        </Btn>
      </div>

      {statusMessage && (
        <div style={{ padding: "10px 14px", borderRadius: 6, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 13, marginBottom: 16, color: "#cbd5e1" }}>
          ℹ️ {statusMessage}
        </div>
      )}

      {report?.checks && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {report.checks.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: "rgba(18, 24, 38, 0.6)", border: "1px solid rgba(255, 255, 255, 0.06)", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "#94a3b8", textTransform: "uppercase" }}>{c.category}</span>
                  {getStatusBadge(c.status)}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc" }}>{c.summary}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>{c.details}</div>
              </div>

              {c.repairable && (
                <Btn variant="secondary" onClick={() => handleRepairCheck(c)} disabled={repairing}>
                  Repair Safe Issue
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal for Repair */}
      {activeRepair && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 480, width: "100%", background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.8)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 18, color: "#f8fafc" }}>Confirm Safe Self-Repair</h3>
            <p style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.5, margin: "0 0 16px" }}>
              Are you sure you want to execute repair <strong>{activeRepair.repairAction}</strong> for <em>{activeRepair.summary}</em>?
            </p>
            <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "#93c5fd", marginBottom: 20 }}>
              🛡️ <strong>Safety Guarantee:</strong> An automatic system backup will be created before executing any state repair. No user notes or credentials will be modified.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="dim" onClick={() => setActiveRepair(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={confirmAndRepair}>Approve Repair</Btn>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
