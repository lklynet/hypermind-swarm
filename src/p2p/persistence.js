const Corestore = require("corestore");
const b4a = require("b4a");

class PersistenceManager {
  constructor(storagePath = "./storage") {
    this.store = new Corestore(storagePath);
    this.primaryCore = null;
    this.peerCores = new Map();
    this.pendingPeerCores = new Map();
    this.knownPeerKeys = new Set();
    this.coreWatchers = new Map();
    this.trackingCore = null;
    this.onMessage = null;
  }

  async init() {
    this.primaryCore = this.store.get({
      name: "my-messages",
      valueEncoding: "json",
    });
    await this.primaryCore.ready();

    this._watchCore(this.primaryCore);

    console.log(
      "Primary Hypercore ready. Key:",
      b4a.toString(this.primaryCore.key, "hex")
    );

    this.trackingCore = this.store.get({
      name: "tracked-peers",
      valueEncoding: "json",
    });
    await this.trackingCore.ready();
    await this._loadTrackedPeers();
  }

  async _loadTrackedPeers() {
    try {
      const length = this.trackingCore.length;
      console.log(`Loading ${length} tracked peers from storage...`);
      for (let i = 0; i < length; i++) {
        const peerKey = await this.trackingCore.get(i);
        if (peerKey && !this.knownPeerKeys.has(peerKey)) {
          this.knownPeerKeys.add(peerKey);
          await this.getPeerCore(peerKey).catch((err) =>
            console.error(`Failed to load peer ${peerKey}:`, err)
          );
        }
      }
    } catch (err) {
      console.error("Error loading tracked peers:", err);
    }
  }

  _watchCore(core) {
    const coreKey = b4a.toString(core.key, "hex");
    if (this.coreWatchers.has(coreKey)) return;

    const watcher = {
      core,
      lastRead: -1,
      reading: false,
      destroyed: false,
      onAppend: null,
    };

    const readMore = async () => {
      if (watcher.reading || watcher.destroyed) return;
      watcher.reading = true;
      try {
        while (!watcher.destroyed && watcher.lastRead < core.length - 1) {
          const seq = ++watcher.lastRead;
          try {
            const msg = await core.get(seq, { wait: true, timeout: 5000 });
            if (this.onMessage) this.onMessage(msg);
          } catch (err) {
            console.error(
              `Error reading from core ${coreKey.slice(0, 8)} seq ${seq}:`,
              err.message
            );
            watcher.lastRead--;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      } finally {
        watcher.reading = false;
        if (!watcher.destroyed && watcher.lastRead < core.length - 1) {
          readMore().catch(() => {});
        }
      }
    };

    watcher.onAppend = () => {
      readMore().catch(() => {});
    };
    core.on("append", watcher.onAppend);
    this.coreWatchers.set(coreKey, watcher);

    if (!core.writable) {
      core.update().then(() => {
        if (core.length > 0) {
          console.log(
            `Remote core ${b4a
              .toString(core.key, "hex")
              .slice(0, 8)} updated. Length: ${core.length}`
          );
        }
        readMore().catch(() => {});
      });
    } else {
      readMore().catch(() => {});
    }
  }

  async _readExisting(core) { }

  async append(msg) {
    if (!this.primaryCore)
      throw new Error("PersistenceManager not initialized");
    await this.primaryCore.append(msg);
  }

  async getPeerCore(publicKey) {
    const keyStr =
      typeof publicKey === "string"
        ? publicKey
        : b4a.toString(publicKey, "hex");

    if (!this.knownPeerKeys.has(keyStr)) {
      this.knownPeerKeys.add(keyStr);
      if (this.trackingCore) {
        this.trackingCore.append(keyStr).catch(console.error);
      }
    }

    if (this.peerCores.has(keyStr)) return this.peerCores.get(keyStr);
    if (this.pendingPeerCores.has(keyStr)) {
      return this.pendingPeerCores.get(keyStr);
    }

    const corePromise = (async () => {
      const core = this.store.get({
        key: b4a.from(keyStr, "hex"),
        valueEncoding: "json",
      });
      await core.ready();
      this.peerCores.set(keyStr, core);
      this._watchCore(core);
      return core;
    })();

    this.pendingPeerCores.set(keyStr, corePromise);
    try {
      return await corePromise;
    } finally {
      this.pendingPeerCores.delete(keyStr);
    }
  }

  replicate(socket) {
    this.store.replicate(socket);
  }

  getPrimaryPublicKey() {
    return b4a.toString(this.primaryCore.key, "hex");
  }

  async getAllMessages() {
    const messages = [];

    for (let i = 0; i < this.primaryCore.length; i++) {
      messages.push(await this.primaryCore.get(i));
    }

    for (const core of this.peerCores.values()) {
      for (let i = 0; i < core.length; i++) {
        messages.push(await core.get(i));
      }
    }

    return messages;
  }

  async cleanup() {
    for (const watcher of this.coreWatchers.values()) {
      watcher.destroyed = true;
      if (watcher.core && watcher.onAppend) {
        watcher.core.removeListener("append", watcher.onAppend);
      }
    }
    this.coreWatchers.clear();
    this.pendingPeerCores.clear();
    this.peerCores.clear();
    if (this.store) {
      await this.store.close();
    }
  }
}

module.exports = PersistenceManager;
