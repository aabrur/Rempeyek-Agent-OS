import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  Tray,
} from "electron";
import electronUpdater from "electron-updater";

import {
  isAllowedExternalUrl,
  isAllowedLocalNavigation,
  withDesktopSessionHeader,
} from "./security.mjs";
import {
  createDesktopSettingsStore,
  resolveDesktopUserDataPath,
} from "./desktop-settings.mjs";
import { startServerProcess } from "./server-process.mjs";
import { createUpdateService } from "./update-service.mjs";

const { autoUpdater } = electronUpdater;

const desktopUserDataPath = resolveDesktopUserDataPath({
  home: app.getPath("home"),
});
if (desktopUserDataPath) app.setPath("userData", desktopUserDataPath);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let ownedServer = null;
let serverStopped = false;
let isQuitting = false;
let closeBehavior = "tray";
let startMinimized = false;
let settingsStore = null;
let updateService = null;

const iconPath = path.join(import.meta.dirname, "assets", "icon.ico");

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function stopOwnedServer() {
  if (serverStopped) return;
  serverStopped = true;
  ownedServer?.stop();
  ownedServer = null;
}

function sendUpdateState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:update-state", { ...state });
}

function createTray() {
  if (tray) return tray;
  tray = new Tray(iconPath);
  tray.setToolTip("Rempeyek Agent OS");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Rempeyek Agent OS", click: focusMainWindow },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("double-click", focusMainWindow);
  return tray;
}

function registerSessionHeader(origin, desktopToken) {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["<all_urls>"] },
    (details, callback) => {
      callback({
        requestHeaders: withDesktopSessionHeader(
          details,
          origin,
          desktopToken,
        ),
      });
    },
  );
}

function createMainWindow(origin) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 375,
    minHeight: 640,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedLocalNavigation(url, origin)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    }
  });
  window.on("close", event => {
    if (isQuitting) return;
    if (closeBehavior === "exit") {
      event.preventDefault();
      isQuitting = true;
      app.quit();
      return;
    }
    event.preventDefault();
    window.hide();
  });
  window.once("ready-to-show", () => {
    if (!startMinimized && !process.argv.includes("--hidden")) window.show();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  return window;
}

function resolveServerPath() {
  return app.isPackaged
    ? path.join(
      process.resourcesPath,
      "app-root",
      "apps",
      "web",
      "server.js",
    )
    : path.resolve(import.meta.dirname, "../web/server.js");
}

function attachServerLogs(server, logsPath) {
  fs.mkdirSync(logsPath, { recursive: true });
  const stream = fs.createWriteStream(
    path.join(logsPath, "desktop-server.log"),
    { flags: "a" },
  );
  server.child.stdout?.pipe(stream, { end: false });
  server.child.stderr?.pipe(stream, { end: false });
  server.child.once("exit", () => stream.end());
}

function runtimePaths() {
  const stateRoot = app.getPath("userData");
  return {
    stateRoot,
    userDataPath: stateRoot,
    vaultPath: path.join(stateRoot, "Vault"),
    logsPath: app.getPath("logs"),
  };
}

function registerIpcHandlers() {
  const paths = runtimePaths();
  settingsStore = createDesktopSettingsStore(
    path.join(paths.stateRoot, "desktop-settings.json"),
  );
  const settings = settingsStore.read();
  closeBehavior = settings.closeBehavior;
  startMinimized = settings.startMinimized;
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    args: ["--hidden"],
  });

  ipcMain.handle("desktop:get-runtime", () => ({
    desktop: true,
    packaged: app.isPackaged,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userDataPath: paths.userDataPath,
    vaultPath: paths.vaultPath,
    stateRoot: paths.stateRoot,
  }));
  ipcMain.handle("desktop:get-settings", () => settingsStore.read());
  ipcMain.handle("desktop:update-settings", (_event, patch) => {
    const next = settingsStore.update(patch);
    closeBehavior = next.closeBehavior;
    startMinimized = next.startMinimized;
    app.setLoginItemSettings({
      openAtLogin: next.launchAtLogin,
      args: ["--hidden"],
    });
    return next;
  });
  ipcMain.handle("desktop:open-path", async (_event, kind) => {
    const targets = {
      state: paths.stateRoot,
      vault: paths.vaultPath,
      logs: paths.logsPath,
    };
    if (!Object.hasOwn(targets, kind)) {
      throw new Error("unsupported desktop path kind");
    }
    fs.mkdirSync(targets[kind], { recursive: true });
    return shell.openPath(targets[kind]);
  });
  ipcMain.handle("desktop:open-external", async (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      throw new Error("unsupported external URL");
    }
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("desktop:check-for-updates", () => {
    if (!app.isPackaged) {
      return { phase: "idle", development: true };
    }
    if (!updateService) {
      return { phase: "idle", initializing: true };
    }
    return updateService.checkNow();
  });
  ipcMain.handle("desktop:restart-to-update", () => {
    if (!app.isPackaged) {
      throw new Error("desktop updates are disabled in development");
    }
    if (!updateService) {
      throw new Error("desktop updater is not ready");
    }
    return updateService.restartToUpdate();
  });
}

async function lifecycleMutationBusy(origin, desktopToken) {
  try {
    const response = await fetch(`${origin}/api/agents/lifecycle`, {
      headers: { "x-desktop-session": desktopToken },
    });
    if (!response.ok) return true;
    const snapshot = await response.json();
    return snapshot?.busy !== false;
  } catch {
    return true;
  }
}

function startUpdateLifecycle(server, desktopToken) {
  if (!app.isPackaged) {
    sendUpdateState({ phase: "idle", development: true });
    return;
  }
  updateService = createUpdateService({
    autoUpdater,
    settingsStore,
    lifecycleBusy: () => lifecycleMutationBusy(
      server.origin,
      desktopToken,
    ),
    emit: sendUpdateState,
  });
  updateService.start();
}

async function startOwnedServer() {
  const paths = runtimePaths();
  const desktopToken = crypto.randomBytes(32).toString("hex");
  serverStopped = false;
  const server = await startServerProcess({
    execPath: process.execPath,
    serverPath: resolveServerPath(),
    stateRoot: paths.stateRoot,
    desktopToken,
  });
  ownedServer = server;
  attachServerLogs(server, paths.logsPath);
  registerSessionHeader(server.origin, desktopToken);
  return { server, desktopToken };
}

async function startApplication() {
  createTray();
  for (;;) {
    try {
      const { server, desktopToken } = await startOwnedServer();
      mainWindow = createMainWindow(server.origin);
      mainWindow.webContents.once(
        "did-finish-load",
        () => startUpdateLifecycle(server, desktopToken),
      );
      await mainWindow.loadURL(server.origin);
      return;
    } catch (error) {
      stopOwnedServer();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      mainWindow = null;
      const result = await dialog.showMessageBox({
        type: "error",
        title: "Rempeyek Agent OS could not start",
        message: "The local Agent OS service could not start.",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["Retry", "Open Logs", "Exit"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (result.response === 0) continue;
      if (result.response === 1) {
        await shell.openPath(app.getPath("logs"));
        continue;
      }
      app.quit();
      return;
    }
  }
}

if (hasSingleInstanceLock) {
  app.on("second-instance", focusMainWindow);
  app.on("before-quit", () => {
    isQuitting = true;
    updateService?.stop();
    stopOwnedServer();
  });
  app.on("activate", focusMainWindow);
  app.whenReady().then(() => {
    registerIpcHandlers();
    return startApplication();
  }).catch(error => {
    dialog.showErrorBox(
      "Rempeyek Agent OS could not start",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });
}
