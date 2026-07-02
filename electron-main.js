const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let setupWindow = null;
let preferencesWindow = null;
let serverProcess = null;

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

const LOADING_HTML = `data:text/html,<html><head><meta charset="utf-8"><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,sans-serif}svg{margin-bottom:24px}svg path{fill:#a17e3e}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}.dot{animation:pulse 1.5s ease-in-out infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}</style></head><body><svg width="48" height="48" viewBox="0 0 700 700"><path d="M337.9.8c12.3.3 19.6 1.2 27.3 3.3 5.7 1.6 14.5 4.7 19.5 7 5 2.3 12 6.2 15.6 8.7 3.5 2.4 10.3 8 14.9 12.4 4.6 4.4 11.4 12.3 15.1 17.6 3.7 5.3 8.1 12.5 9.9 16.1 1.8 3.6 4.8 11.4 6.6 17.5 1.9 6.1 4 16 4.8 22.1 1.1 8.1 1.1 14.4.1 23.4-.8 6.9-3.7 19.5-6.5 28.6-2.8 8.9-5.7 20.6-6.4 26-.9 6.4-.9 13.8-.1 21.4.6 6.5 2.1 16.4 3.3 22.1 1.1 5.8 3.8 16.1 5.8 23.1 2.1 7 6.2 19 9.1 26.7 2.9 7.6 8.1 20.4 11.6 28.2 3.5 7.9 9.8 21 14 29.3 4.2 8.2 11.7 21.6 16.6 29.9 4.8 8.2 11.7 19.3 15.3 24.6 3.6 5.4 10.3 14.8 15 20.8 4.7 6.1 11.2 14.2 14.4 18.1 3.3 3.8 11.5 11.6 18.3 17.2 6.8 5.7 16.1 12.3 20.8 14.8 4.6 2.4 14.4 5.9 21.7 7.7 7.4 1.8 17 4.7 21.5 6.4 4.4 1.6 12.5 5.6 17.8 8.7 5.4 3.1 13.9 9.6 18.9 14.3 5 4.8 12.1 13 15.7 18.3 3.7 5.2 8 12.2 9.6 15.4 1.7 3.2 4.1 9.1 5.5 13 1.3 3.9 3.3 11.3 4.4 16.3 1.1 5 2 15.2 2 22.7 0 7.9-.9 18-2.1 24-1.2 5.8-3.4 13.7-5 17.6-1.6 3.9-5.5 11.7-8.7 17.3-3.2 5.6-9.4 14.1-13.7 18.9-4.4 4.7-12 11.6-16.9 15.3-5 3.7-13.4 8.9-18.8 11.5-5.3 2.7-14.1 6-19.4 7.4-5.4 1.4-16.5 2.9-24.7 3.3-11.2.5-18 .1-26.7-1.5-6.4-1.2-16.1-3.9-21.4-6-5.4-2.1-14.2-6.7-19.5-10.3-5.4-3.5-13-9.3-16.9-12.8-4-3.4-11.3-12-16.4-19.1-5.1-7.1-13.2-17.1-18.2-22.1-4.9-5-12.8-11.9-17.4-15.2-4.7-3.3-14-9-20.8-12.7-6.8-3.7-17.9-9.1-24.7-11.9-6.8-2.8-18.2-7.2-25.3-9.7-7.2-2.5-20.9-6.8-30.6-9.5-9.6-2.8-27.2-7.1-39-9.7-11.8-2.5-29.9-5.9-40.3-7.5-15.6-2.4-24.3-2.9-50.7-2.9-29 0-32.7.2-42.2 2.9-5.7 1.6-13.9 4.6-18.2 6.7-4.3 2.1-13.1 7.2-19.5 11.4-7.4 4.8-15.9 8.9-23.4 11.4-10.5 3.5-13.3 3.9-28.6 3.9-14.2 0-18.3-.5-26-3.1-5-1.7-13.2-5.1-18.2-7.7-6.3-3.3-12.4-8.1-20.1-15.8-7.5-7.6-12.6-14-15.8-20.2-2.6-5-6.1-13.5-7.8-18.9-2.6-8.2-3-12.4-3-27.3.1-15.7.4-18.6 3.7-27.9 1.9-5.7 6-14.5 8.9-19.5 3-5 9.3-12.9 14.1-17.6 4.8-4.6 11.8-10.3 15.7-12.6 3.8-2.3 10.4-5.7 14.7-7.4 4.3-1.8 15.1-4.5 24.1-6 8.9-1.5 18.9-3.8 22.1-5 3.2-1.2 10.5-4.9 16.2-8.2 5.7-3.4 15.1-10.1 20.7-14.9 5.7-4.9 15.6-15 21.9-22.5 6.4-7.5 16.9-21.6 23.3-31.2 6.4-9.7 15.3-24.9 19.8-33.8 4.6-9 10.4-22.1 13.1-29.3 2.6-7.1 6.3-19.1 8.2-26.6 2.9-11.7 3.4-16.3 3.3-31.9-.1-16.7-.5-19.6-5-36.3-4.3-16.2-4.9-20.5-5.5-37.7-.5-16.9-.2-21.1 2.2-31.2 1.5-6.5 4.7-15.8 7-20.8 2.3-5 7.1-13.4 10.6-18.7 3.6-5.3 10.6-13.5 15.6-18.2 5-4.8 11.7-10.5 14.9-12.7 3.2-2.2 8.8-5.5 12.4-7.3 3.6-1.7 10.6-4.6 15.6-6.2 5-1.7 12.3-3.8 16.2-4.7 4.5-1 13.5-1.5 24.1-1.2zm-41.6 249.7c-6.5 4-15.8 10.6-20.7 14.7-4.9 4-13.1 11.7-18.1 17.1-5 5.3-12.6 14.1-16.9 19.5-4.3 5.3-12.4 16.7-18.1 25.3-5.7 8.6-15.2 25.6-21.1 37.7-6 12.2-12.6 27.4-14.7 33.8-2.1 6.4-4.6 15.8-5.5 20.8-.9 5-1.3 13.8-1 19.5.4 7.3 1.5 12.5 3.8 17.5 1.8 4 5.8 10 9 13.5 3.2 3.5 9 8.6 12.9 11.2 4 2.7 11.3 6.9 16.3 9.4 5 2.6 12.9 6.2 17.5 8.2 4.7 2 14.3 5.6 21.5 8 7.1 2.5 20.9 6.4 30.5 8.8 9.7 2.4 23.7 5.6 31.2 7.1 7.5 1.5 20.4 3.5 28.6 4.6 8.2 1 23.7 2.6 34.5 3.4 10.7.8 24.7 1.1 31.1.6 6.5-.4 15.5-1.4 20.2-2.2 4.6-.7 12.5-2.5 17.5-3.9 5-1.5 10.7-3.5 12.7-4.5 2-1 6-4 9-6.7 2.9-2.6 6.6-7.5 8.1-10.7 2.4-5.1 2.7-8.2 2.6-25.3-.1-18-.5-20.9-4.7-37.1-2.5-9.6-7.5-25.4-11.2-35.1-3.6-9.6-9.2-23.3-12.3-30.5-3.1-7.1-10.5-22.1-16.4-33.1-6-11.1-15.3-27.2-20.7-35.8-5.5-8.6-13.3-20.1-17.4-25.6-4.1-5.6-13.2-15.9-20.2-23-9.4-9.7-14.6-13.9-20.4-16.6-6.9-3.2-9.6-3.7-22.1-4-12.2-.3-15.8.2-24.1 2.9-5.3 1.7-15 6.5-21.4 10.5z"/></svg><div style="font-size:15px;color:#8b949e">Starting Hypermind<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div></body></html>`;

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function deleteSettings() {
  try {
    fs.unlinkSync(SETTINGS_PATH);
  } catch {}
}

async function resetAndShowSetup() {
  deleteSettings();
  if (mainWindow) mainWindow.close();
  if (serverProcess) {
    try {
      serverProcess.cleanup();
    } catch {}
    serverProcess = null;
  }
  createSetupWindow();
}

async function checkForUpdates() {
  const current = app.getVersion();
  return new Promise((resolve) => {
    const req = https.get(
      "https://api.github.com/repos/lklynet/hypermind-swarm/releases/latest",
      {
        headers: {
          "User-Agent": "Hypermind",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => {
          body += d;
        });
        res.on("end", () => {
          try {
            const release = JSON.parse(body);
            const latest = release.tag_name.replace(/^v/, "");
            resolve({ latest, current, url: release.html_url });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function checkForUpdatesOnStartup() {
  const info = await checkForUpdates();
  if (!info || info.latest === info.current) return;
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `Version ${info.latest} is available (you have ${info.current}).`,
      detail: "Go to the releases page to download the update.",
      buttons: ["Download", "Later"],
      defaultId: 0,
    })
    .then(({ response }) => {
      if (response === 0) require("electron").shell.openExternal(info.url);
    });
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Preferences...",
                accelerator: "CmdOrCtrl+,",
                click: () => openPreferences(),
              },
              { type: "separator" },
              {
                label: "Check for Updates...",
                click: async () => {
                  const info = await checkForUpdates();
                  if (!info) {
                    dialog.showErrorBox(
                      "Update Check Failed",
                      "Unable to check for updates.",
                    );
                    return;
                  }
                  if (info.latest === info.current) {
                    dialog.showMessageBox(mainWindow, {
                      message: `Hypermind ${info.current} is the latest version.`,
                      buttons: ["OK"],
                    });
                  } else {
                    dialog
                      .showMessageBox(mainWindow, {
                        type: "info",
                        title: "Update Available",
                        message: `Version ${info.latest} is available (you have ${info.current}).`,
                        detail:
                          "Go to the releases page to download the update.",
                        buttons: ["Download", "Cancel"],
                        defaultId: 0,
                      })
                      .then(({ response }) => {
                        if (response === 0)
                          require("electron").shell.openExternal(info.url);
                      });
                  }
                },
              },
              { type: "separator" },
              {
                label: "Reset Setup...",
                click: () => resetAndShowSetup(),
              },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        ...(isMac
          ? [{ role: "close" }]
          : [
              {
                label: "Preferences...",
                accelerator: "Ctrl+,",
                click: () => openPreferences(),
              },
              { type: "separator" },
              {
                label: "Check for Updates...",
                click: async () => {
                  const info = await checkForUpdates();
                  if (!info) {
                    dialog.showErrorBox(
                      "Update Check Failed",
                      "Unable to check for updates.",
                    );
                    return;
                  }
                  if (info.latest === info.current) {
                    dialog.showMessageBox(mainWindow, {
                      message: `Hypermind ${info.current} is the latest version.`,
                      buttons: ["OK"],
                    });
                  } else {
                    dialog
                      .showMessageBox(mainWindow, {
                        type: "info",
                        title: "Update Available",
                        message: `Version ${info.latest} is available (you have ${info.current}).`,
                        detail:
                          "Go to the releases page to download the update.",
                        buttons: ["Download", "Cancel"],
                        defaultId: 0,
                      })
                      .then(({ response }) => {
                        if (response === 0)
                          require("electron").shell.openExternal(info.url);
                      });
                  }
                },
              },
              { type: "separator" },
              {
                label: "Reset Setup...",
                click: () => resetAndShowSetup(),
              },
              { type: "separator" },
              { role: "quit" },
            ]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openPreferences() {
  if (preferencesWindow) {
    preferencesWindow.close();
    preferencesWindow = null;
  }
  preferencesWindow = new BrowserWindow({
    width: 440,
    height: 400,
    resizable: false,
    parent: mainWindow,
    modal: true,
    titleBarStyle: "default",
    title: "Preferences",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "electron-preload.js"),
    },
  });
  preferencesWindow.loadFile("electron-preferences.html");
  preferencesWindow.on("closed", () => {
    preferencesWindow = null;
  });
}

ipcMain.handle("prefs:get", () => {
  const s = readSettings() || {};
  return {
    devicePersistence: !!s.devicePersistence,
    megaNode: !!s.megaNode,
    giphyApiKey: s.giphyApiKey || null,
  };
});

ipcMain.handle("prefs:save", (_event, prefs) => {
  const s = readSettings() || {};
  s.devicePersistence = prefs.devicePersistence;
  s.megaNode = prefs.megaNode;
  s.giphyApiKey = prefs.giphyApiKey || undefined;
  saveSettings(s);
});

ipcMain.handle("prefs:restart", () => {
  app.relaunch();
  app.quit();
});

ipcMain.on("notification:badge", (_event, count) => {
  if (app.dock) {
    app.dock.setBadge(count > 0 ? String(count) : "");
  }
});

function applyEnvFromSettings() {
  const s = readSettings();
  if (!s) return;
  if (s.devicePersistence) process.env.DEVICE_PERSISTENCE = "true";
  if (s.megaNode) process.env.MEGA_NODE = "true";
  if (s.giphyApiKey) process.env.GIPHY_API_KEY = s.giphyApiKey;
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (Date.now() - start > timeoutMs)
        return reject(new Error("Server did not start in time"));
      const req = http.get(url + "/api/health", (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(poll, 500));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(poll, 500);
      });
      req.end();
    };
    poll();
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 1000,
    minHeight: 480,
    title: "Hypermind",

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "electron-preload.js"),
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      require("electron").shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      e.preventDefault();
      require("electron").shell.openExternal(url);
    }
  });
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 520,
    height: 540,
    resizable: false,
    title: "Hypermind Setup",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "electron-preload.js"),
    },
  });

  setupWindow.loadFile("electron-setup.html");
  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

ipcMain.handle("setup:deploy-local", async () => {
  saveSettings({ mode: "local" });
  if (setupWindow) setupWindow.close();
  await startLocalMode();
});

ipcMain.handle("setup:connect-remote", async (_event, url) => {
  saveSettings({ mode: "remote", remoteUrl: url });
  if (setupWindow) setupWindow.close();
  await startRemoteMode(url);
});

async function startLocalMode() {
  if (!process.env.STORAGE_PATH) {
    process.env.STORAGE_PATH = path.join(app.getPath("userData"), "storage");
  }
  applyEnvFromSettings();
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}`;

  await createMainWindow();
  mainWindow.loadURL(LOADING_HTML);

  const { main } = require("./server");
  main().catch(console.error);
  serverProcess = { cleanup: () => {} };

  await waitForServer(url);
  mainWindow.loadURL(url);
  mainWindow.webContents.once("did-finish-load", () =>
    checkForUpdatesOnStartup(),
  );
}

async function startRemoteMode(url) {
  await createMainWindow();
  mainWindow.loadURL(url);
  mainWindow.webContents.once("did-finish-load", () =>
    checkForUpdatesOnStartup(),
  );
}

app.whenReady().then(async () => {
  buildAppMenu();

  const settings = readSettings();
  if (settings) {
    if (settings.mode === "remote") {
      await startRemoteMode(settings.remoteUrl);
    } else {
      await startLocalMode();
    }
  } else {
    createSetupWindow();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null && setupWindow === null) {
    const settings = readSettings();
    if (!settings) {
      createSetupWindow();
    }
  }
});
