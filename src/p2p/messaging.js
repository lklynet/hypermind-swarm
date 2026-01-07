const {
  verifyPoW,
  verifySignature,
  createPublicKey,
} = require("../core/security");
const crypto = require("crypto");
const { MAX_RELAY_HOPS, CHAT_RATE_LIMIT } = require("../config/constants");
const { BloomFilterManager } = require("../state/bloom");

class MessageHandler {
  constructor(
    peerManager,
    diagnostics,
    pingStore,
    relayCallback,
    broadcastCallback,
    pingCallback,
    systemMessageFn
  ) {
    this.peerManager = peerManager;
    this.diagnostics = diagnostics;
    this.pingStore = pingStore;
    this.relayCallback = relayCallback;
    this.broadcastCallback = broadcastCallback;
    this.pingCallback = pingCallback;
    this.systemMessageFn = systemMessageFn;
    this.bloomFilter = new BloomFilterManager();
    this.bloomFilter.start();
    this.rateLimits = new Map();
  }

  handleMessage(msg, sourceSocket) {
    if (!validateMessage(msg)) {
      return;
    }

    if (msg.type === "HEARTBEAT") {
      this.handleHeartbeat(msg, sourceSocket);
    } else if (msg.type === "LEAVE") {
      this.handleLeave(msg, sourceSocket);
    } else if (msg.type === "PING") {
      this.handlePing(msg, sourceSocket);
    } else if (msg.type === "AMPLIFY") {
      this.handleAmplify(msg, sourceSocket);
    }
  }

  handleHeartbeat(msg, sourceSocket) {
    this.diagnostics.increment("heartbeatsReceived");
    const { id, username, seq, hops, nonce, sig } = msg;

    // Optimization: Check for duplicates BEFORE verifyPoW (CPU intensive)
    const stored = this.peerManager.getPeer(id);
    if (stored && seq <= stored.seq) {
      this.diagnostics.increment("duplicateSeq");
      return;
    }

    if (!verifyPoW(id, nonce)) {
      this.diagnostics.increment("invalidPoW");
      return;
    }

    if (!sig) return;

    try {
      // Check if we can accept new peers (only matters for new peers)
      if (!stored && !this.peerManager.canAcceptPeer(id)) return;

      // Derive public key on-demand from peer ID
      const key = createPublicKey(id);

      if (!verifySignature(`seq:${seq}`, sig, key)) {
        this.diagnostics.increment("invalidSig");
        return;
      }

      if (hops === 0) {
        sourceSocket.peerId = id;
      }

      const getIp = (sock) => {
        if (sock.remoteAddress) return sock.remoteAddress;
        if (sock.rawStream && sock.rawStream.remoteHost)
          return sock.rawStream.remoteHost;
        if (sock.rawStream && sock.rawStream.remoteAddress)
          return sock.rawStream.remoteAddress;
        return null;
      };

      const ip = hops === 0 ? getIp(sourceSocket) : null;
      const wasNew = this.peerManager.addOrUpdatePeer(id, seq, ip);

      if (wasNew) {
        this.diagnostics.increment("newPeersAdded");
        this.broadcastCallback();
        if (this.systemMessageFn && hops === 0) {
          this.systemMessageFn({
            type: "SYSTEM",
            content: `Connection established with Node ...${id.slice(-8)}`,
            timestamp: Date.now(),
          });
        }
      }

      // Only relay if we haven't already relayed this message (bloom filter check)
      if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, seq)) {
        this.bloomFilter.markRelayed(id, seq);
        this.diagnostics.increment("heartbeatsRelayed");
        this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    } catch (e) {
      return;
    }
  }

  handleLeave(msg, sourceSocket) {
    this.diagnostics.increment("leaveMessages");
    const { id, hops, sig } = msg;

    if (!sig) return;

    // Only process leave messages for peers we know about
    if (!this.peerManager.hasPeer(id)) return;

    // Derive public key on-demand from peer ID
    const key = createPublicKey(id);

    if (!verifySignature(`type:LEAVE:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    if (this.peerManager.hasPeer(id)) {
      this.peerManager.removePeer(id);
      this.broadcastCallback();

      if (this.systemMessageFn && hops === 0) {
        this.systemMessageFn({
          type: "SYSTEM",
          content: `Node ...${id.slice(-8)} disconnected.`,
          timestamp: Date.now(),
        });
      }

      // Use id:leave as key for LEAVE messages
      if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, "leave")) {
        this.bloomFilter.markRelayed(id, "leave");
        this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    }
  }

  handlePing(msg, sourceSocket) {
    const { author, id, sig, timestamp } = msg;
    const ttl = typeof msg.ttl === "number" ? msg.ttl : 6; // Default TTL

    // Rate Limiting
    const now = Date.now();
    let rateData = this.rateLimits.get(author);

    if (!rateData || now - rateData.windowStart > 10000) {
      // Reset window
      rateData = { count: 0, windowStart: now };
    }

    if (rateData.count >= 5) {
      return; // Drop message
    }

    // Integrity Check: Ensure ID matches content/timestamp
    const idBase = author + msg.content + msg.timestamp;
    const computedId = crypto.createHash("sha256").update(idBase).digest("hex");

    if (computedId !== id) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    // Verify signature (moved before store check to ensure validity even if we have it,
    // though for perf we might want to check store first. But strictness is good.)
    const key = createPublicKey(author);
    if (!verifySignature(`ping:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    // Store and Notify
    const isNew = this.pingStore.add(msg);
    if (isNew) {
      rateData.count++;
      this.rateLimits.set(author, rateData);

      if (this.pingCallback) {
        this.pingCallback(msg);
      }
    }

    // GOSSIP / RELAY
    // If it's new OR it has high TTL (meaning it's a fresh wave), we might relay.
    // For now, simple gossip: if TTL > 0, relay.
    // To prevent loops, we can rely on bloom filter?
    // PingStore prevents re-processing, but doesn't track if we relayed THIS instance.
    // We should use BloomFilter for pings too if we want to support re-gossip.
    // But currently pingStore.add returns false if exists.

    if (isNew && ttl > 0) {
      this.diagnostics.increment("pingsRelayed");
      this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
    }
  }

  handleAmplify(msg, sourceSocket) {
    const { id, originalPing, amplifier, sig, ttl } = msg;

    // check bloom filter for this amplify message
    if (this.bloomFilter.hasRelayed(id, "amplify")) {
      return;
    }

    // Verify Amplify Signature
    const key = createPublicKey(amplifier);
    // We assume the ID was generated as hash(amplifier + originalPing.id + timestamp)
    // and signed as `amplify:${id}`
    if (!verifySignature(`amplify:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    // Verify Original Ping Integrity & Signature
    // We do this to prevent spamming fake pings via amplify
    const pingIdBase =
      originalPing.author + originalPing.content + originalPing.timestamp;
    const computedPingId = crypto
      .createHash("sha256")
      .update(pingIdBase)
      .digest("hex");
    if (computedPingId !== originalPing.id) return;

    const pingKey = createPublicKey(originalPing.author);
    if (!verifySignature(`ping:${originalPing.id}`, originalPing.sig, pingKey))
      return;

    // Process Ping (Add if missing)
    const isNewPing = this.pingStore.add(originalPing);
    if (isNewPing && this.pingCallback) {
      this.pingCallback(originalPing);
    }

    // Apply Like
    if (this.pingStore.like(originalPing.id, amplifier)) {
      // If like was successful (first time this user liked it locally), notify UI?
      // We can reuse pingCallback to push update?
      // Or we need a specific event. For now, pushing the ping again updates the UI state
      // because the UI receives the ping object.
      // But pingStore.add returns false if exists.
      // We might want to force an update.
      if (this.pingCallback) {
        // Fetch the updated ping object
        const updatedPing = this.pingStore.get(originalPing.id);
        this.pingCallback(updatedPing);
      }
    }

    // Relay Amplify Message
    if (ttl > 0) {
      this.bloomFilter.markRelayed(id, "amplify");
      this.diagnostics.increment("amplifyRelayed");
      this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
    }
  }
}

const validateMessage = (msg) => {
  if (!msg || typeof msg !== "object") return false;
  if (!msg.type) return false;

  const msgSize = JSON.stringify(msg).length;
  if (msgSize > require("../config/constants").MAX_MESSAGE_SIZE) return false;

  if (msg.type === "HEARTBEAT") {
    const allowedFields = ["type", "id", "seq", "hops", "nonce", "sig"];
    const fields = Object.keys(msg);
    return (
      fields.every((f) => allowedFields.includes(f)) &&
      msg.id &&
      typeof msg.seq === "number" &&
      typeof msg.hops === "number" &&
      msg.nonce &&
      msg.sig
    );
  }

  if (msg.type === "LEAVE") {
    const allowedFields = ["type", "id", "hops", "sig"];
    const fields = Object.keys(msg);
    return (
      fields.every((f) => allowedFields.includes(f)) &&
      msg.id &&
      typeof msg.hops === "number" &&
      msg.sig
    );
  }

  if (msg.type === "PING") {
    const allowedFields = [
      "type",
      "id",
      "author",
      "username",
      "content",
      "timestamp",
      "sig",
      "hops",
      "ttl",
    ];
    const fields = Object.keys(msg);
    return (
      fields.every((f) => allowedFields.includes(f)) &&
      msg.id &&
      msg.author &&
      msg.content &&
      msg.timestamp &&
      msg.sig &&
      typeof msg.ttl === "number"
    );
  }

  if (msg.type === "AMPLIFY") {
    const allowedFields = [
      "type",
      "id",
      "originalPing", // Renamed from originalTweet
      "amplifier", // User ID of amplifier
      "sig",
      "ttl",
    ];
    const fields = Object.keys(msg);
    return (
      fields.every((f) => allowedFields.includes(f)) &&
      msg.id &&
      msg.originalPing &&
      validateMessage(msg.originalPing) &&
      msg.amplifier &&
      msg.sig &&
      typeof msg.ttl === "number"
    );
  }

  return false;
};

module.exports = { MessageHandler, validateMessage };
