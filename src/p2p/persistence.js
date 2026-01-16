const Corestore = require("corestore");
const Hypercore = require("hypercore");
const b4a = require("b4a");
const path = require("path");

class PersistenceManager {
  constructor(storagePath = "./storage") {
    this.store = new Corestore(storagePath);
    this.primaryCore = null;
    this.peerCores = new Map();
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
  }

  _watchCore(core) {
    let lastRead = -1;

    const readMore = async () => {
      while (lastRead < core.length - 1) {
        const seq = ++lastRead;
        try {
          const msg = await core.get(seq, { wait: true });
          if (this.onMessage) this.onMessage(msg);
        } catch (err) {
          console.error(
            `Error reading from core ${b4a
              .toString(core.key, "hex")
              .slice(0, 8)}:`,
            err
          );
          break;
        }
      }
    };

    core.on("append", readMore);

    if (!core.writable) {
      core.update().then(() => {
        if (core.length > 0) {
          console.log(
            `Remote core ${b4a
              .toString(core.key, "hex")
              .slice(0, 8)} updated. Length: ${core.length}`
          );
        }
        readMore();
      });
    } else {
      readMore();
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
    if (this.peerCores.has(keyStr)) return this.peerCores.get(keyStr);

    const core = this.store.get({
      key: b4a.from(keyStr, "hex"),
      valueEncoding: "json",
    });
    await core.ready();
    this.peerCores.set(keyStr, core);

    this._watchCore(core);

    return core;
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
    this.peerCores.clear();
    if (this.store) {
      await this.store.close();
    }
  }
}

module.exports = PersistenceManager;
