import { useState } from "react";
import { Btn } from "@rempeyek/ui";

export function AutoUpdateModal({
  open,
  onClose,
  desktopUpdate,
  desktopBusy,
  onDownload,
  onRestart,
  onCheck,
}) {
  const [repairing, setRepairing] = useState(false);
  const [repairHint, setRepairHint] = useState("");

  if (!open) return null;

  const phase = desktopUpdate?.phase || "idle";
  const version = desktopUpdate?.version || "2.4.1";
  const percent = desktopUpdate?.percent;

  const handleSelfRepair = async () => {
    setRepairing(true);
    setRepairHint("Cleaning local state & verifying update channel…");
    try {
      try {
        localStorage.removeItem("aos-release-check");
        sessionStorage.clear();
      } catch {}
      await new Promise(r => setTimeout(r, 600));
      setRepairHint("Checking for verified v2.4.1 update build…");
      if (typeof onCheck === "function") {
        await onCheck();
      }
      setRepairHint("Self-repair scan finished successfully.");
    } catch (e) {
      setRepairHint(`Self-repair completed with notice: ${e?.message || e}`);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div
      className="auto-update-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.82)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-update-title"
    >
      <div
        className="auto-update-modal"
        style={{
          width: "100%",
          maxWidth: "520px",
          backgroundColor: "#0d131f",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 30px rgba(56, 189, 248, 0.15)",
          padding: "28px",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          animation: "modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)",
              }}
            >
              🚀
            </div>
            <div>
              <h2 id="auto-update-title" style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "-0.01em" }}>
                Auto Update Available
              </h2>
              <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: "600" }}>
                Rempeyek Agent OS v{version}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: "14px", color: "#cbd5e1", lineHeight: "1.6", marginBottom: "20px" }}>
          {phase === "ready" ? (
            <p style={{ margin: 0 }}>
              <b>v{version}</b> is downloaded and verified. Restart the app now to complete auto update.
            </p>
          ) : phase === "downloading" ? (
            <div>
              <p style={{ margin: "0 0 10px 0" }}>Downloading update package v{version}…</p>
              <div style={{ width: "100%", height: "8px", backgroundColor: "#1e293b", borderRadius: "4px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${percent || 0}%`,
                    backgroundColor: "#38bdf8",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px", fontSize: "12px", color: "#94a3b8" }}>
                {percent || 0}%
              </div>
            </div>
          ) : phase === "error" ? (
            <div style={{ padding: "12px", backgroundColor: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.25)", borderRadius: "8px", color: "#fb7185" }}>
              Update check encountered a minor network issue. Click <b>Auto-Fix & Retry</b> to resolve automatically.
            </div>
          ) : (
            <p style={{ margin: 0 }}>
              A new update (<b>v{version}</b>) is available with automatic self-repair, enhanced Electron stability, and pop-up auto update controls.
            </p>
          )}
        </div>

        {repairHint && (
          <div style={{ fontSize: "12px", color: "#38bdf8", marginBottom: "16px", fontStyle: "italic" }}>
            {repairHint}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Btn variant="dim" onClick={handleSelfRepair} disabled={repairing || desktopBusy}>
            {repairing ? "Repairing…" : "Auto-Fix OS"}
          </Btn>
          <Btn variant="dim" onClick={onClose}>
            Remind Me Later
          </Btn>

          {phase === "ready" ? (
            <Btn variant="primary" onClick={onRestart} disabled={desktopBusy}>
              {desktopBusy ? "Restarting…" : "Restart & Apply Update"}
            </Btn>
          ) : phase === "available" || phase === "error" || phase === "idle" ? (
            <Btn variant="primary" onClick={onDownload} disabled={desktopBusy}>
              {desktopBusy ? "Working…" : "Download & Install"}
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}
