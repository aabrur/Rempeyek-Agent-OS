const METHODS = [
  "getRuntime",
  "getSettings",
  "updateSettings",
  "checkForUpdates",
  "restartToUpdate",
  "openPath",
  "openExternal",
  "onUpdateState",
];

export function desktopRuntime(bridge) {
  if (!bridge || typeof bridge !== "object") {
    return {
      desktop: false,
      getRuntime: async () => null,
      getSettings: async () => null,
      updateSettings: async () => null,
      checkForUpdates: async () => null,
      restartToUpdate: async () => null,
      openPath: async () => null,
      openExternal: async () => null,
      onUpdateState: () => null,
    };
  }

  const runtime = { desktop: true };
  for (const method of METHODS) {
    runtime[method] = typeof bridge[method] === "function"
      ? (...args) => bridge[method](...args)
      : method === "onUpdateState"
        ? () => null
        : async () => null;
  }
  return runtime;
}
