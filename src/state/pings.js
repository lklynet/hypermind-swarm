const { LRUCache } = require("./lru");

class PingStore {
  constructor(capacity = 1000) {
    this.cache = new LRUCache(capacity);
    this.users = new Map(); // authorId -> username
  }

  add(ping) {
    if (!ping || !ping.id) return false;
    if (this.cache.has(ping.id)) return false;

    // Update user mapping
    if (ping.author && ping.username) {
      this.users.set(ping.author, ping.username);
    }

    this.cache.set(ping.id, {
      ...ping,
      likes: ping.likes || 0,
      amplifiedBy: new Set(ping.amplifiedBy || []),
      comments: ping.comments || [],
      receivedAt: Date.now(),
    });
    return true;
  }

  addComment(pingId, comment) {
    const ping = this.cache.get(pingId);
    if (!ping) return false;

    if (!ping.comments) {
      ping.comments = [];
    }

    // Check for duplicates
    if (ping.comments.some((c) => c.id === comment.id)) return false;

    // Update user mapping from comment
    if (comment.author && comment.username) {
      this.users.set(comment.author, comment.username);
    }

    ping.comments.push(comment);
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

  getUsername(authorId) {
    return this.users.get(authorId);
  }
}

module.exports = { PingStore };
