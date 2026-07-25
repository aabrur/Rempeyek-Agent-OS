import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  shell,
  Tray,
} from "electron";

import {
  isAllowedExternalUrl,
  isAllowedLocalNavigation,
  withDesktopSessionHeader,
} from "./security.mjs";
import { startServerProcess } from "./server-process.mjs";

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
    if (!process.argv.includes("--hidden")) window.show();
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

async function startOwnedServer() {
  const userDataPath = app.getPath("userData");
  const logsPath = app.getPath("logs");
  const desktopToken = crypto.randomBytes(32).toString("hex");
  serverStopped = false;
  const server = await startServerProcess({
    execPath: process.execPath,
    serverPath: resolveServerPath(),
    stateRoot: userDataPath,
    desktopToken,
  });
  ownedServer = server;
  attachServerLogs(server, logsPath);
  registerSessionHeader(server.origin, desktopToken);
  return server;
}

async function startApplication() {
  createTray();
  for (;;) {
    try {
      const server = await startOwnedServer();
      mainWindow = createMainWindow(server.origin);
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
    stopOwnedServer();
  });
  app.on("activate", focusMainWindow);
  app.whenReady().then(startApplication).catch(error => {
    dialog.showErrorBox(
      "Rempeyek Agent OS could not start",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });
}
