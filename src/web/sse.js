const {
  BROADCAST_THROTTLE,
  MAX_SSE_CLIENTS,
  SSE_HEARTBEAT_INTERVAL,
} = require("../config/constants");

class SSEManager {
  constructor() {
    this.clients = new Set();
    this.lastBroadcast = 0;

    setInterval(() => this.heartbeat(), SSE_HEARTBEAT_INTERVAL);
  }

  addClient(res) {
    if (this.clients.size >= MAX_SSE_CLIENTS) {
      return false;
    }
    this.clients.add(res);
    return true;
  }

  removeClient(res) {
    this.clients.delete(res);
  }

  heartbeat() {
    for (const client of this.clients) {
      try {
        client.write(": heartbeat\n\n");
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }

  broadcastUpdate(data) {
    const now = Date.now();
    if (now - this.lastBroadcast < BROADCAST_THROTTLE) return;
    this.lastBroadcast = now;

    this.broadcast(data);
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    for (const client of this.clients) {
      try {
        client.write(`data: ${message}\n\n`);
        if (client.flush) client.flush();
      } catch (e) {
        console.error("Failed to write to SSE client:", e);
        this.clients.delete(client);
      }
    }
  }

  get size() {
    return this.clients.size;
  }
}

module.exports = { SSEManager };
