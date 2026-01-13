const { DIAGNOSTICS_INTERVAL } = require("../config/constants");

class DiagnosticsManager {
  constructor() {
    this.startTime = Date.now();
    this.stats = {
      heartbeatsReceived: 0,
      heartbeatsRelayed: 0,
      invalidPoW: 0,
      duplicateSeq: 0,
      invalidSig: 0,
      newPeersAdded: 0,
      bytesReceived: 0,
      bytesSent: 0,
      bytesRelayed: 0,
      leaveMessages: 0,
      pingsRelayed: 0,
      amplifyRelayed: 0,
      pingsSent: 0,
    };

    this.interval = null;
  }

  increment(key, amount = 1) {
    if (this.stats.hasOwnProperty(key)) {
      this.stats[key] += amount;
    }
  }

  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime,
      memory: process.memoryUsage(),
    };
  }

  getAndResetStats() {
    const stats = this.getStats();
    this.reset();
    return stats;
  }

  reset() {
    Object.keys(this.stats).forEach((k) => (this.stats[k] = 0));
  }

  stopLogging() {
    // No-op, interval removed
  }
}

module.exports = { DiagnosticsManager };
