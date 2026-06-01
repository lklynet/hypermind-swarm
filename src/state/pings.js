const { LRUCache } = require("./lru");
const { MAX_NOTES_PER_PING } = require("../config/constants");

const emptyNoteCounts = () => ({
  total: 0,
  amplifies: 0,
  comments: 0,
  quotes: 0,
});

function compactPingSnapshot(ping) {
  if (!ping) return null;

  const snapshot = {
    type: ping.type || "PING",
    id: ping.id,
    author: ping.author,
    username: ping.username,
    content: ping.content,
    timestamp: ping.timestamp,
    sig: ping.sig,
    swarmId: ping.swarmId || 0,
    topic: ping.topic || "",
  };

  if (ping.quoteOf) {
    snapshot.quoteOf = ping.quoteOf;
  }

  return snapshot;
}

class PingStore {
  constructor(capacity = 1000) {
    this.cache = new LRUCache(capacity);
  }

  ensureInteractionState(ping) {
    if (!ping) return null;

    ping.type = ping.type || "PING";
    ping.likes = ping.likes || 0;

    if (!(ping.amplifiedBy instanceof Set)) {
      ping.amplifiedBy = new Set(ping.amplifiedBy || []);
    }

    if (!Array.isArray(ping.comments)) {
      ping.comments = [];
    }

    if (!Array.isArray(ping.notes)) {
      ping.notes = [];
    }

    ping.noteCounts = {
      ...emptyNoteCounts(),
      ...(ping.noteCounts || {}),
    };

    return ping;
  }

  serializePing(ping) {
    if (!ping) return null;
    this.ensureInteractionState(ping);

    return {
      ...ping,
      amplifiedBy: Array.from(ping.amplifiedBy || []),
      comments: [...(ping.comments || [])],
      notes: [...(ping.notes || [])],
      noteCounts: { ...ping.noteCounts },
    };
  }

  add(ping) {
    if (!ping || !ping.id) return false;
    if (this.cache.has(ping.id)) return false;

    this.cache.set(ping.id, {
      ...ping,
      likes: ping.likes || 0,
      amplifiedBy: new Set(ping.amplifiedBy || []),
      comments: Array.isArray(ping.comments) ? ping.comments : [],
      notes: Array.isArray(ping.notes) ? ping.notes : [],
      noteCounts: {
        ...emptyNoteCounts(),
        ...(ping.noteCounts || {}),
      },
      receivedAt: Date.now(),
    });
    return true;
  }

  addNote(pingId, note) {
    const ping = this.cache.get(pingId);
    if (!ping || !note || !note.id || !note.type) return false;

    this.ensureInteractionState(ping);

    if (ping.notes.some((existing) => existing.id === note.id)) {
      return false;
    }

    ping.notes.push(note);
    if (ping.notes.length > MAX_NOTES_PER_PING) {
      ping.notes.splice(0, ping.notes.length - MAX_NOTES_PER_PING);
    }

    ping.receivedAt = Date.now();
    ping.noteCounts.total += 1;
    if (note.type === "amplify") {
      ping.noteCounts.amplifies += 1;
    } else if (note.type === "comment") {
      ping.noteCounts.comments += 1;
    } else if (note.type === "quote") {
      ping.noteCounts.quotes += 1;
    }

    return true;
  }

  addAmplify(id, userId, metadata = {}) {
    const ping = this.cache.get(id);
    if (!ping) return false;

    this.ensureInteractionState(ping);

    if (ping.amplifiedBy.has(userId)) return false;

    ping.amplifiedBy.add(userId);
    ping.likes = (ping.likes || 0) + 1;

    const timestamp = metadata.timestamp || Date.now();
    this.addNote(id, {
      id: metadata.noteId || `amplify:${id}:${userId}`,
      type: "amplify",
      pingId: id,
      author: userId,
      username: metadata.username,
      timestamp,
    });

    return true;
  }

  like(id, userId) {
    return this.addAmplify(id, userId);
  }

  get(id) {
    const ping = this.cache.get(id);
    return this.ensureInteractionState(ping);
  }

  has(id) {
    return this.cache.has(id);
  }

  getAll() {
    const pings = [];
    for (const [id, ping] of this.cache.entries()) {
      pings.push(this.serializePing(ping));
    }
    return pings.sort((a, b) => b.timestamp - a.timestamp);
  }

  getByAuthor(authorId) {
    const pings = [];
    for (const [id, ping] of this.cache.entries()) {
      if (ping.author === authorId) {
        pings.push(this.serializePing(ping));
      }
    }
    return pings.sort((a, b) => b.timestamp - a.timestamp);
  }

  addComment(pingId, comment) {
    const ping = this.cache.get(pingId);
    if (!ping) return false;

    this.ensureInteractionState(ping);

    if (ping.comments.some((c) => c.id === comment.id)) {
      return false;
    }

    ping.comments.push(comment);
    this.addNote(pingId, {
      id: `comment:${comment.id}`,
      type: "comment",
      pingId,
      author: comment.author,
      username: comment.username,
      content: comment.content,
      timestamp: comment.timestamp || Date.now(),
    });
    return true;
  }

  addQuote(originalPingId, quotePing) {
    if (!quotePing || !quotePing.id) return false;

    this.add(quotePing);

    return this.addNote(originalPingId, {
      id: `quote:${quotePing.id}`,
      type: "quote",
      pingId: originalPingId,
      author: quotePing.author,
      username: quotePing.username,
      content: quotePing.content,
      quotePingId: quotePing.id,
      timestamp: quotePing.timestamp || Date.now(),
    });
  }

  getUsername(authorId) {
    for (const [id, ping] of this.cache.entries()) {
      if (ping.author === authorId && ping.username) {
        return ping.username;
      }
    }
    return null;
  }

  getPingsSince(timestamp) {
    const pings = [];
    for (const [id, ping] of this.cache.entries()) {
      if (ping.timestamp > timestamp || ping.receivedAt > timestamp) {
        pings.push(this.serializePing(ping));
      }
    }
    return pings.sort((a, b) => a.timestamp - b.timestamp);
  }

  cleanup() {
    this.cache.clear();
  }
}

module.exports = { PingStore, compactPingSnapshot };
