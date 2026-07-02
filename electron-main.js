const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

let mainWindow = null;
let setupWindow = null;

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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
                label: "Check for Updates...",
                click: () => autoUpdater.checkForUpdatesAndNotify(),
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
                label: "Check for Updates...",
                click: () => autoUpdater.checkForUpdatesAndNotify(),
              },
              { type: "separator" },
              { role: "quit" },
            ]),
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupAutoUpdater() {
  autoUpdater.on("update-available", () => {
    mainWindow?.webContents.send("update:status", { status: "available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update:progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update:status", { status: "downloaded" });
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "A new version has been downloaded.",
        detail: "Restart now to install the update.",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:status", { status: "error", message: err.message });
  });
}

ipcMain.handle("update:check", () => {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    dialog.showErrorBox("Update Check Failed", err.message);
  });
});

ipcMain.handle("update:install", () => {
  autoUpdater.quitAndInstall();
});

async function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: "Hypermind",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "electron-preload.js"),
    },
  });

  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
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
  const { main } = require("./server");
  main().catch(console.error);
  await createMainWindow(`http://localhost:${process.env.PORT || 3000}`);
  setupAutoUpdater();
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}

async function startRemoteMode(url) {
  await createMainWindow(url);
  setupAutoUpdater();
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
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
