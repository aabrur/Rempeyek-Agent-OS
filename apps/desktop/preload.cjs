const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, value) => (
  value === undefined
    ? ipcRenderer.invoke(channel)
    : ipcRenderer.invoke(channel, value)
);

contextBridge.exposeInMainWorld("rempeyekDesktop", Object.freeze({
  getRuntime: () => invoke("desktop:get-runtime"),
  getSettings: () => invoke("desktop:get-settings"),
  updateSettings: patch => invoke("desktop:update-settings", patch),
  checkForUpdates: () => invoke("desktop:check-for-updates"),
    downloadUpdate: () => invoke("desktop:download-update"),
    restartToUpdate: () => invoke("desktop:restart-to-update"),
  openPath: kind => invoke("desktop:open-path", kind),
  openExternal: url => invoke("desktop:open-external", url),
  onUpdateState: listener => {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    const handler = (_event, payload) => {
      listener(structuredClone(payload));
    };
    ipcRenderer.on("desktop:update-state", handler);
    return () => ipcRenderer.removeListener("desktop:update-state", handler);
  },
}));
