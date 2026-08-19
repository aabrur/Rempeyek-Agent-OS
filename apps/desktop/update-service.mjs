const SIX_HOURS = 6 * 60 * 60 * 1000;
const SAFE_UPDATE_ERROR = "The desktop updater could not complete this request. "
  + "Check your connection and try again.";

function rawErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingReleaseMetadata(error) {
  const message = rawErrorMessage(error);
  const status = error?.statusCode ?? error?.status;
  return /(?:latest\.yml|releases\.atom|\breleases\b)/i.test(message)
    && (status === 404 || /\b404\b/.test(message));
}

export function createUpdateService({
  autoUpdater,
  settingsStore,
  lifecycleBusy,
  emit,
  now = () => new Date(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  if (
    !autoUpdater ||
    !settingsStore ||
    typeof lifecycleBusy !== "function" ||
    typeof emit !== "function"
  ) {
    throw new Error(
      "autoUpdater, settingsStore, lifecycleBusy, and emit are required",
    );
  }

  let state = {
    phase: "idle",
    version: null,
    error: null,
    checkedAt: null,
  };
  let timer = null;
  let checkPromise = null;
  let started = false;

  const publish = patch => {
    state = { ...state, ...patch };
    emit({ ...state });
  };

  const onNotAvailable = () => publish({
    phase: "not-available",
    version: null,
    error: null,
    percent: null,
  });
  const publishFailure = error => {
    if (isMissingReleaseMetadata(error)) {
      onNotAvailable();
      return;
    }
    publish({ phase: "error", error: SAFE_UPDATE_ERROR });
  };

  const checkNow = () => {
    if (checkPromise) return checkPromise;
    autoUpdater.allowPrerelease =
      settingsStore.read().updateChannel === "preview";
    publish({
      phase: "checking",
      error: null,
      checkedAt: new Date(now()).toISOString(),
    });
    let result;
    try {
      result = autoUpdater.checkForUpdates();
    } catch (error) {
      publishFailure(error);
      return Promise.resolve({ ...state });
    }
    checkPromise = Promise.resolve(result)
      .catch(error => {
        publishFailure(error);
      })
      .then(() => ({ ...state }))
      .finally(() => {
        checkPromise = null;
      });
    return checkPromise;
  };

  const onAvailable = info => {
    publish({
      phase: "available",
      version: String(info?.version || "") || null,
      error: null,
    });
    if (!settingsStore.read().autoDownload) return;
    publish({ phase: "downloading", percent: 0 });
    try {
      Promise.resolve(autoUpdater.downloadUpdate()).catch(error => {
        publishFailure(error);
      });
    } catch (error) {
      publishFailure(error);
    }
  };
  const onProgress = progress => publish({
    phase: "downloading",
    percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))),
  });
  const onDownloaded = info => publish({
    phase: "ready",
    version: String(info?.version || "") || state.version,
    error: null,
    percent: 100,
  });
  const onError = error => publishFailure(error);

  autoUpdater.on("update-available", onAvailable);
  autoUpdater.on("update-not-available", onNotAvailable);
  autoUpdater.on("download-progress", onProgress);
  autoUpdater.on("update-downloaded", onDownloaded);
  autoUpdater.on("error", onError);

  return {
      start() {
        if (started) return { ...state };
        started = true;
        const settings = settingsStore.read();
        autoUpdater.autoDownload = false;
        autoUpdater.allowPrerelease = settings.updateChannel === "preview";
        if (settings.autoCheck) void checkNow();
        timer = setIntervalImpl(() => {
          if (settingsStore.read().autoCheck) void checkNow();
        }, SIX_HOURS);
        return { ...state };
      },
      checkNow,
      downloadNow() {
        if (state.phase === "error") {
          // Re-check first: a direct downloadUpdate() after a network error would
          // fail immediately again without a fresh update-available signal.
          return checkNow();
        }
        if (state.phase !== "available") {
          return Promise.resolve({ ...state });
        }
        publish({ phase: "downloading", percent: 0, error: null });
        try {
          return Promise.resolve(autoUpdater.downloadUpdate())
            .catch(error => { publishFailure(error); })
            .then(() => ({ ...state }));
        } catch (error) {
          publishFailure(error);
          return Promise.resolve({ ...state });
        }
      },
      async restartToUpdate() {
        if (state.phase !== "ready") {
          throw new Error("no downloaded update is ready");
        }
        if (await lifecycleBusy()) {
          throw new Error(
            "finish the active lifecycle operation before restarting",
          );
        }
        autoUpdater.quitAndInstall(false, true);
      },
      stop() {
        if (timer !== null) {
          clearIntervalImpl(timer);
          timer = null;
        }
      },
      snapshot() {
        return { ...state };
      },
    };
}
