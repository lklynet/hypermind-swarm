const {
  BROADCAST_THROTTLE,
  MAX_SSE_CLIENTS,
  SSE_HEARTBEAT_INTERVAL,
} = require("../config/constants");

class SSEManager {
  constructor() {
    this.clients = new Set();
    this.clientKeys = new Map();
    this.clientsPerKey = new Map();
    this.maxClientsPerKey = parseInt(process.env.MAX_SSE_CLIENTS_PER_IP, 10) || 5;
    this.lastBroadcast = 0;
    this.heartbeatInterval = setInterval(
      () => this.heartbeat(),
      SSE_HEARTBEAT_INTERVAL
    );
  }

  addClient(res, clientKey = "unknown") {
    if (this.clients.size >= MAX_SSE_CLIENTS) {
      return false;
    }
    const keyCount = this.clientsPerKey.get(clientKey) || 0;
    if (keyCount >= this.maxClientsPerKey) return false;
    this.clients.add(res);
    this.clientKeys.set(res, clientKey);
    this.clientsPerKey.set(clientKey, keyCount + 1);
    return true;
  }

  removeClient(res) {
    this.clients.delete(res);
    const key = this.clientKeys.get(res);
    this.clientKeys.delete(res);
    if (key) {
      const next = (this.clientsPerKey.get(key) || 1) - 1;
      if (next > 0) this.clientsPerKey.set(key, next);
      else this.clientsPerKey.delete(key);
    }
  }

  heartbeat() {
    for (const client of this.clients) {
      try {
        if (!client.write(": heartbeat\n\n")) {
          this.removeClient(client);
          client.end();
        }
      } catch (e) {
        this.removeClient(client);
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
        if (!client.write(`data: ${message}\n\n`)) {
          this.removeClient(client);
          client.end();
          continue;
        }
        if (client.flush) client.flush();
      } catch (e) {
        this.removeClient(client);
      }
    }
  }

  get size() {
    return this.clients.size;
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.end();
      } catch (e) { }
    }
    this.clients.clear();
    this.clientKeys.clear();
    this.clientsPerKey.clear();
  }
}

module.exports = { SSEManager };
