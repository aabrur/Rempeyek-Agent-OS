const NOTIFICATION_CONTENT = Object.freeze({
  available: {
    title: "Update available",
    body: version => `Rempeyek Agent OS ${version} is available.`,
  },
  ready: {
    title: "Update ready",
    body: version => (
      `Rempeyek Agent OS ${version} is ready. Restart from Settings to apply it.`
    ),
  },
});

function safeVersion(value) {
  const version = String(value || "update")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 64);
  return version || "update";
}

export function createDesktopNotifier({
  NotificationImpl,
  settingsStore,
} = {}) {
  if (!NotificationImpl || !settingsStore) {
    throw new Error("NotificationImpl and settingsStore are required");
  }
  let lastNotification = "";

  return state => {
    const content = NOTIFICATION_CONTENT[state?.phase];
    if (!content || !settingsStore.read().nativeNotifications) return false;
    if (
      typeof NotificationImpl.isSupported === "function" &&
      !NotificationImpl.isSupported()
    ) {
      return false;
    }
    const version = safeVersion(state?.version);
    const key = `${state.phase}:${version}`;
    if (key === lastNotification) return false;
    lastNotification = key;
    new NotificationImpl({
      title: content.title,
      body: content.body(version),
      silent: false,
    }).show();
    return true;
  };
}
