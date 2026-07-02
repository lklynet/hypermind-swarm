const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hypermind", {
  deployLocal: () => ipcRenderer.invoke("setup:deploy-local"),
  connectRemote: (url) => ipcRenderer.invoke("setup:connect-remote", url),

  getPreferences: () => ipcRenderer.invoke("prefs:get"),
  savePreferences: (prefs) => ipcRenderer.invoke("prefs:save", prefs),
  restartApp: () => ipcRenderer.invoke("prefs:restart"),

  setBadge: (count) => ipcRenderer.send("notification:badge", count),
});
