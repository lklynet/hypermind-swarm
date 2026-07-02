const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hypermind", {
  deployLocal: () => ipcRenderer.invoke("setup:deploy-local"),
  connectRemote: (url) => ipcRenderer.invoke("setup:connect-remote", url),

  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),

  onUpdateStatus: (callback) => {
    ipcRenderer.on("update:status", (_event, data) => callback(data));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on("update:progress", (_event, data) => callback(data));
  },
});
