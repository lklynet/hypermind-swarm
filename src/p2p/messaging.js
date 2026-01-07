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
    tweetStore,
    relayCallback,
    broadcastCallback,
    tweetCallback,
    systemMessageFn
  ) {
    this.peerManager = peerManager;
    this.diagnostics = diagnostics;
    this.tweetStore = tweetStore;
    this.relayCallback = relayCallback;
    this.broadcastCallback = broadcastCallback;
    this.tweetCallback = tweetCallback;
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
    } else if (msg.type === "TWEET") {
      this.handleTweet(msg, sourceSocket);
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

  handleTweet(msg, sourceSocket) {
    const { author, id, sig, timestamp } = msg;

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

    // Check if we already have this tweet
    if (this.tweetStore.has(id)) {
      return;
    }

    // Verify signature
    const key = createPublicKey(author);
    if (!verifySignature(`tweet:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    // Store and Notify
    if (this.tweetStore.add(msg)) {
      rateData.count++;
      this.rateLimits.set(author, rateData);

      if (this.tweetCallback) {
        this.tweetCallback(msg);
      }
    }

    // NO AUTOMATIC RELAY
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

  if (msg.type === "TWEET") {
    const allowedFields = [
      "type",
      "author",
      "username",
      "content",
      "timestamp",
      "id",
      "sig",
      "hops",
    ];
    const fields = Object.keys(msg);
    return (
      fields.every((f) => allowedFields.includes(f)) &&
      msg.author &&
      msg.content &&
      typeof msg.content === "string" &&
      msg.content.length <= 280 &&
      typeof msg.timestamp === "number"
    );
  }

  return false;
};

module.exports = { MessageHandler, validateMessage };
