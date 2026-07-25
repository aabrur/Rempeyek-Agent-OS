import { fork } from "node:child_process";

export function startServerProcess({
  forkImpl = fork,
  execPath,
  serverPath,
  stateRoot,
  desktopToken,
  timeoutMs = 15000,
} = {}) {
  if (!execPath || !serverPath || !stateRoot || !desktopToken) {
    return Promise.reject(new Error(
      "execPath, serverPath, stateRoot, and desktopToken are required",
    ));
  }
  return new Promise((resolve, reject) => {
    const child = forkImpl(serverPath, [], {
      execPath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: "0",
        DASH_HOST: "127.0.0.1",
        AGENT_STATE_DIR: stateRoot,
        DESKTOP_SESSION_TOKEN: desktopToken,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    let settled = false;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      child.kill();
    };
    const finishError = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      reject(error);
    };
    const timer = setTimeout(
      () => finishError(new Error("local server did not become ready")),
      timeoutMs,
    );
    child.once("error", finishError);
    child.once("exit", code => finishError(
      new Error(`local server exited before ready (${code})`),
    ));
    child.on("message", message => {
      if (
        settled ||
        message?.type !== "rempeyek:ready" ||
        !Number.isInteger(message.port) ||
        message.port < 1 ||
        message.port > 65535
      ) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        child,
        port: message.port,
        origin: `http://127.0.0.1:${message.port}`,
        stop,
      });
    });
  });
}
