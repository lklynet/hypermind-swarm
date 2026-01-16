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
      invalidMessages: 0,
      bufferOverflows: 0,
      rateLimitExceeded: 0,
    };
  }

  increment(key, amount = 1) {
    if (Object.prototype.hasOwnProperty.call(this.stats, key)) {
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

  cleanup() {
    this.reset();
  }
}

module.exports = { DiagnosticsManager };
