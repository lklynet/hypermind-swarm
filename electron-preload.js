const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hypermind", {
  getPreferences: () => ipcRenderer.invoke("prefs:get"),
  savePreferences: (prefs) => ipcRenderer.invoke("prefs:save", prefs),
  restartApp: () => ipcRenderer.invoke("prefs:restart"),
});
