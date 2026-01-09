const {
  verifyPoW,
  verifySignature,
  createPublicKey,
} = require("../core/security");
const crypto = require("crypto");
const { MAX_RELAY_HOPS, CHAT_RATE_LIMIT } = require("../config/constants");
const { BloomFilterManager } = require("../state/bloom");
const { hasSwarmSubscription } = require("../utils/swarm-utils");

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
    this.getSwarmFilter = () => null;
  }

  setGetSwarmFilter(fn) {
    this.getSwarmFilter = fn;
  }

  handleMessage(msg, sourceSocket) {
    if (!validateMessage(msg)) {
      this.diagnostics.increment("invalidMessages");
      return;
    }

    if (msg.type === "HEARTBEAT") {
      this.handleHeartbeat(msg, sourceSocket);
    } else if (msg.type === "PING") {
      this.handlePing(msg, sourceSocket);
    } else if (msg.type === "LEAVE") {
      this.handleLeave(msg, sourceSocket);
    } else if (msg.type === "AMPLIFY") {
      this.handleAmplify(msg, sourceSocket);
    } else if (msg.type === "COMMENT") {
      this.handleComment(msg, sourceSocket);
    }
  }

  handleHeartbeat(msg, sourceSocket) {
    this.diagnostics.increment("heartbeatsReceived");
    const { id, username, seq, hops, nonce, sig, swarmFilter } = msg;

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
      if (!stored && !this.peerManager.canAcceptPeer(id)) return;

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
      const wasNew = this.peerManager.addOrUpdatePeer(
        id,
        seq,
        ip,
        swarmFilter,
        msg.encKey
      );

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

    if (!this.peerManager.hasPeer(id)) return;

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

      if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, "leave")) {
        this.bloomFilter.markRelayed(id, "leave");
        this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
      }
    }
  }

  handlePing(msg, sourceSocket) {
    const { author, id, sig, timestamp } = msg;
    const ttl = typeof msg.ttl === "number" ? msg.ttl : 10;

    const now = Date.now();
    let rateData = this.rateLimits.get(author);

    if (!rateData || now - rateData.windowStart > 10000) {

      rateData = { count: 0, windowStart: now };
    }

    if (rateData.count >= 5) {
      return; 
    }

    const idBase = author + msg.content + msg.timestamp;
    const computedId = crypto.createHash("sha256").update(idBase).digest("hex");

    if (computedId !== id) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    const key = createPublicKey(author);
    if (!verifySignature(`ping:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    const isNew = this.pingStore.add(msg);
    if (isNew) {
      rateData.count++;
      this.rateLimits.set(author, rateData);

      if (this.pingCallback) {
        this.pingCallback(msg);
      }
    }

    if (isNew && ttl > 0) {
      this.diagnostics.increment("pingsRelayed");
      this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
    }
  }

  handleAmplify(msg, sourceSocket) {
    const { id, originalPing, amplifier, sig, ttl } = msg;

    if (this.bloomFilter.hasRelayed(id, "amplify")) {
      return;
    }

    const key = createPublicKey(amplifier);

    if (!verifySignature(`amplify:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

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

    const isNewPing = this.pingStore.add(originalPing);
    if (isNewPing && this.pingCallback) {
      this.pingCallback(originalPing);
    }

    if (this.pingStore.like(originalPing.id, amplifier)) {

      if (this.pingCallback) {

        const updatedPing = this.pingStore.get(originalPing.id);
        this.pingCallback(updatedPing);
      }
    }

    if (ttl > 0) {
      this.bloomFilter.markRelayed(id, "amplify");
      this.diagnostics.increment("amplifyRelayed");
      this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
    }
  }

  handleComment(msg, sourceSocket) {
    const { id, pingId, author, content, timestamp, sig, ttl } = msg;

    const now = Date.now();
    let rateData = this.rateLimits.get(author);
    if (!rateData || now - rateData.windowStart > 10000) {
      rateData = { count: 0, windowStart: now };
    }
    if (rateData.count >= 10) return;

    const idBase = author + pingId + content + timestamp;
    const computedId = crypto.createHash("sha256").update(idBase).digest("hex");
    if (computedId !== id) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    const key = createPublicKey(author);
    if (!verifySignature(`comment:${id}`, sig, key)) {
      this.diagnostics.increment("invalidSig");
      return;
    }

    const isNew = this.pingStore.addComment(pingId, msg);
    if (isNew) {
      rateData.count++;
      this.rateLimits.set(author, rateData);

      if (this.pingCallback) {
        const updatedPing = this.pingStore.get(pingId);
        if (updatedPing) {
          this.pingCallback(updatedPing);
        }
      }
    }

    if (isNew && ttl > 0) {
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
    const allowedFields = [
      "type",
      "id",
      "username",
      "seq",
      "hops",
      "nonce",
      "sig",
      "encKey",
      "swarmFilter",
    ];
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
      "swarmId",
      "topic",
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
      "originalPing", 
      "amplifier",
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

  if (msg.type === "COMMENT") {
    const allowedFields = [
      "type",
      "id",
      "pingId",
      "author",
      "username",
      "content",
      "timestamp",
      "sig",
      "ttl",
    ];
    const fields = Object.keys(msg);
    return (
      fields.every((f) => allowedFields.includes(f)) &&
      msg.id &&
      msg.pingId &&
      msg.author &&
      msg.content &&
      msg.timestamp &&
      msg.sig &&
      typeof msg.ttl === "number"
    );
  }

  return false;
};

module.exports = { MessageHandler, validateMessage };
