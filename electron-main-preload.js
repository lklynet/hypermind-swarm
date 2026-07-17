const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hypermind", {
  setBadge: (count) => ipcRenderer.send("notification:badge", count),
});
