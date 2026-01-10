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
      pings.push({
        ...ping,
        amplifiedBy: Array.from(ping.amplifiedBy || []),
      });
    }
    return pings.sort((a, b) => b.timestamp - a.timestamp);
  }

  getByAuthor(authorId) {
    const pings = [];
    for (const [id, ping] of this.cache.entries()) {
      if (ping.author === authorId) {
        pings.push({
          ...ping,
          amplifiedBy: Array.from(ping.amplifiedBy || []),
        });
      }
    }
    return pings.sort((a, b) => b.timestamp - a.timestamp);
  }

  addComment(pingId, comment) {
    const ping = this.cache.get(pingId);
    if (!ping) return false;

    if (!ping.comments) {
      ping.comments = [];
    }

    if (ping.comments.some((c) => c.id === comment.id)) {
      return false;
    }

    ping.comments.push(comment);
    return true;
  }

  getUsername(authorId) {
    for (const [id, ping] of this.cache.entries()) {
      if (ping.author === authorId && ping.username) {
        return ping.username;
      }
    }
    return null;
  }
}

module.exports = { PingStore };
