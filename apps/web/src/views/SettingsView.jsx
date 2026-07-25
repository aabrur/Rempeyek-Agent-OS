import { useEffect, useState } from "react";
import { Btn, PageHead, Panel } from "@rempeyek/ui";
import { THEMES } from "@rempeyek/theme-engine";
import { api } from "../api";
import { AgentManagementPanel } from "../components/AgentManagementPanel";
import { RuntimeSettingsPanel } from "../components/RuntimeSettingsPanel";
import { ThemePicker } from "../components/ThemePicker";
import { desktopRuntime } from "../lib/desktop-runtime.mjs";

export function SettingsView({ theme, onTheme, state }) {
  const [runtime] = useState(() => desktopRuntime(
    globalThis.window?.rempeyekDesktop,
  ));
  const [version, setVersion] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [nativeRuntime, setNativeRuntime] = useState(null);
  const [nativeSettings, setNativeSettings] = useState(null);
  const [updateState, setUpdateState] = useState(null);
  const [nativeBusy, setNativeBusy] = useState("");
  const [nativeHint, setNativeHint] = useState("");

  const loadLifecycle = async () => {
    const response = await api("/api/agents/lifecycle");
    if (response && !response.error) setLifecycle(response);
    return response;
  };

  useEffect(() => {
    let alive = true;
    api("/api/version").then(value => {
      if (alive && value && !value.error) setVersion(value);
    });
    api("/api/agents/lifecycle").then(value => {
      if (alive && value && !value.error) setLifecycle(value);
    });
    if (!runtime.desktop) {
      return () => {
        alive = false;
      };
    }
    Promise.all([runtime.getRuntime(), runtime.getSettings()])
      .then(([runtimeValue, settingsValue]) => {
        if (!alive) return;
        setNativeRuntime(runtimeValue);
        setNativeSettings(settingsValue);
      })
      .catch(error => {
        if (alive) setNativeHint(error.message);
      });
    const unsubscribe = runtime.onUpdateState(value => {
      if (alive) setUpdateState(value);
    });
    return () => {
      alive = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [runtime]);

  const patchNative = async patch => {
    const key = Object.keys(patch)[0] || "settings";
    setNativeBusy(key);
    setNativeHint("");
    try {
      const next = await runtime.updateSettings(patch);
      if (next) setNativeSettings(next);
    } catch (error) {
      setNativeHint(error.message);
    } finally {
      setNativeBusy("");
    }
  };

  const checkDesktopUpdate = async () => {
    setNativeBusy("check");
    setNativeHint("");
    try {
      const next = await runtime.checkForUpdates();
      if (next) setUpdateState(next);
    } catch (error) {
      setNativeHint(error.message);
    } finally {
      setNativeBusy("");
    }
  };

  const restartToUpdate = async () => {
    setNativeBusy("restart");
    setNativeHint("");
    try {
      await runtime.restartToUpdate();
    } catch (error) {
      setNativeHint(error.message);
      setNativeBusy("");
    }
  };

  const active = THEMES.find(item => item.id === theme);
  const shownVersion = nativeRuntime?.version || version?.version;

  return (
    <section className="view active">
      <PageHead title="SETTINGS">
        Appearance, software version, and workspace facts. Everything else
        lives in <code>agents.config.json</code>.
      </PageHead>

      <div className="view-stack">
        <Panel title="APPEARANCE" chip="4 structural themes">
          <div className="settings-themes">
            <ThemePicker theme={theme} onPick={onTheme} />
          </div>
          <p className="settings-note">
            {active ? `${active.name} — ${active.description}.` : ""}{" "}
            Minimalist and Brutalist switch off glow, stars, and particles by
            design; the system “reduce motion” preference is always respected.
          </p>
        </Panel>

        {lifecycle
          ? (
            <AgentManagementPanel
              state={lifecycle}
              refresh={loadLifecycle}
            />
          )
          : null}

        {runtime.desktop && nativeSettings && (
          <Panel
            title="DESKTOP & STARTUP"
            chip={nativeRuntime?.packaged ? "desktop" : "development"}
          >
            <div className="settings-facts">
              <div>
                <span>LAUNCH AT LOGIN</span>
                <label>
                  <input
                    type="checkbox"
                    checked={nativeSettings.launchAtLogin}
                    disabled={Boolean(nativeBusy)}
                    onChange={event => patchNative({
                      launchAtLogin: event.target.checked,
                    })}
                  />{" "}
                  {nativeSettings.launchAtLogin ? "Enabled" : "Off"}
                </label>
              </div>
              <div>
                <span>CLOSE WINDOW</span>
                <select
                  aria-label="Close window behavior"
                  value={nativeSettings.closeBehavior}
                  disabled={Boolean(nativeBusy)}
                  onChange={event => patchNative({
                    closeBehavior: event.target.value,
                  })}
                >
                  <option value="tray">Keep running in tray</option>
                  <option value="exit">Exit application</option>
                </select>
              </div>
              <div>
                <span>START MINIMIZED</span>
                <label>
                  <input
                    type="checkbox"
                    checked={nativeSettings.startMinimized}
                    disabled={Boolean(nativeBusy)}
                    onChange={event => patchNative({
                      startMinimized: event.target.checked,
                    })}
                  />{" "}
                  {nativeSettings.startMinimized ? "Enabled" : "Off"}
                </label>
              </div>
              <div>
                <span>UPDATE NOTIFICATIONS</span>
                <label>
                  <input
                    type="checkbox"
                    checked={nativeSettings.nativeNotifications}
                    disabled={Boolean(nativeBusy)}
                    onChange={event => patchNative({
                      nativeNotifications: event.target.checked,
                    })}
                  />{" "}
                  {nativeSettings.nativeNotifications ? "Enabled" : "Off"}
                </label>
              </div>
            </div>
            {nativeHint && (
              <p className="settings-note" role="status">{nativeHint}</p>
            )}
          </Panel>
        )}

        <RuntimeSettingsPanel desktop={runtime} />

        <Panel
          title="SOFTWARE"
          chip={runtime.desktop ? "verified updates" : "source update"}
        >
          <div className="settings-facts">
            <div>
              <span>VERSION</span>
              <b>{shownVersion ? `v${shownVersion}` : "—"}</b>
            </div>
            <div>
              <span>REVISION</span>
              <b>{version?.rev || (nativeRuntime?.packaged ? "packaged" : "—")}</b>
            </div>
            <div>
              <span>REPOSITORY</span>
              <b>
                {version?.repo
                  ? (
                    <a
                      href={`https://github.com/${version.repo}/releases`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {version.repo}
                    </a>
                  )
                  : runtime.desktop
                    ? "managed desktop release"
                    : "no remote configured"}
              </b>
            </div>
            {runtime.desktop && nativeSettings && (
              <>
                <div>
                  <span>UPDATE CHANNEL</span>
                  <select
                    aria-label="Desktop update channel"
                    value={nativeSettings.updateChannel}
                    disabled={Boolean(nativeBusy)}
                    onChange={event => patchNative({
                      updateChannel: event.target.value,
                    })}
                  >
                    <option value="stable">Stable</option>
                    <option value="preview">Preview</option>
                  </select>
                </div>
                <div>
                  <span>AUTOMATIC CHECKS</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={nativeSettings.autoCheck}
                      disabled={Boolean(nativeBusy)}
                      onChange={event => patchNative({
                        autoCheck: event.target.checked,
                      })}
                    />{" "}
                    {nativeSettings.autoCheck ? "Enabled" : "Off"}
                  </label>
                </div>
                <div>
                  <span>AUTOMATIC DOWNLOAD</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={nativeSettings.autoDownload}
                      disabled={Boolean(nativeBusy)}
                      onChange={event => patchNative({
                        autoDownload: event.target.checked,
                      })}
                    />{" "}
                    {nativeSettings.autoDownload ? "Enabled" : "Off"}
                  </label>
                </div>
                <div>
                  <span>UPDATE STATE</span>
                  <b>{updateState?.phase || (
                    nativeRuntime?.packaged ? "idle" : "development"
                  )}</b>
                </div>
                <div>
                  <span>LAST CHECK</span>
                  <b>{updateState?.checkedAt || "not checked this session"}</b>
                </div>
              </>
            )}
          </div>
          {runtime.desktop ? (
            <>
              <div className="aa-actions">
                <Btn
                  variant="dim"
                  disabled={
                    Boolean(nativeBusy) ||
                    ["checking", "downloading"].includes(updateState?.phase)
                  }
                  onClick={checkDesktopUpdate}
                >
                  {nativeBusy === "check" ? "Checking…" : "Check for Updates"}
                </Btn>
                <Btn
                  variant="primary"
                  disabled={
                    Boolean(nativeBusy) ||
                    updateState?.phase !== "ready"
                  }
                  onClick={restartToUpdate}
                >
                  {nativeBusy === "restart"
                    ? "Restarting…"
                    : "Restart to Update"}
                </Btn>
              </div>
              <p className="settings-note">
                Packaged updates verify release metadata before the separate
                restart action. Development mode never contacts a release feed.
              </p>
            </>
          ) : (
            <p className="settings-note">
              Newer GitHub source releases use a clean-check, fast-forward-only
              pull, <code>npm ci</code>, and build behind an approval. Dirty or
              diverged checkouts stop safely.
            </p>
          )}
        </Panel>

        <Panel title="WORKSPACE" chip="read-only">
          <div className="settings-facts">
            <div>
              <span>AGENCY</span>
              <b>{state.agency || "REMPEYEK AGENT OS"}</b>
            </div>
            <div>
              <span>NEURAL VAULT</span>
              <b title={state.vault || ""}>
                {state.vault || "set VAULT_PATH"}
              </b>
            </div>
            <div>
              <span>AGENTS</span>
              <b>{state.agents?.length ?? 0} registered</b>
            </div>
            <div>
              <span>ACCESS</span>
              <b>{state.auth === "token-locked" ? "TOKEN" : "LOCAL"}</b>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
