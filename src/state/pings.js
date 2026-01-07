const { LRUCache } = require("./lru");

class PingStore {
  constructor(capacity = 1000) {
    this.cache = new LRUCache(capacity);
  }

  add(ping) {
    if (!ping || !ping.id) return false;
    if (this.cache.has(ping.id)) return false;

    this.cache.set(ping.id, {
      ...ping,
      likes: ping.likes || 0,
      amplifiedBy: new Set(ping.amplifiedBy || []),
      receivedAt: Date.now(),
    });
    return true;
  }

  like(id, userId) {
    const ping = this.cache.get(id);
    if (!ping) return false;

    // Ensure amplifiedBy is a Set (in case it was serialized/deserialized differently)
    if (!(ping.amplifiedBy instanceof Set)) {
      ping.amplifiedBy = new Set(ping.amplifiedBy || []);
    }

    if (ping.amplifiedBy.has(userId)) return false;

    ping.amplifiedBy.add(userId);
    ping.likes = (ping.likes || 0) + 1;
    return true;
  }

  get(id) {
    return this.cache.get(id);
  }

  has(id) {
    return this.cache.has(id);
  }

  getAll() {
    const pings = [];
    for (const [id, ping] of this.cache.entries()) {
      // Convert Set to Array for JSON serialization
      pings.push({
        ...ping,
        amplifiedBy: Array.from(ping.amplifiedBy || []),
      });
    }
    // Sort by timestamp descending (newest first)
    return pings.sort((a, b) => b.timestamp - a.timestamp);
  }
}

module.exports = { PingStore };
