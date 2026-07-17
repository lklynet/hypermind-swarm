const crypto = require("crypto");
const {
  signMessage,
  verifySignature,
  createPublicKey,
  verifyPoW,
} = require("../../core/security");
const {
  compactCatchupMessage,
  validateMessage,
  validateQuotedPingSnapshot,
} = require("./message-validator");

// The deployed swarm uses this legacy wire format. Keep the compatibility
// rules isolated here so stricter web and rendering boundaries can evolve
// without silently changing what existing peers send and accept.
const PROTOCOL_VERSION = 1;
const BOUND_AMPLIFY_PREFIX = "a11f1ed0";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function legacyMessageId(msg) {
  switch (msg.type) {
    case "PING":
      return sha256(msg.author + msg.content + msg.timestamp);
    case "QUOTE":
      return sha256(msg.author + msg.quoteOf + msg.content + msg.timestamp);
    case "COMMENT":
      return sha256(msg.author + msg.pingId + msg.content + msg.timestamp);
    case "AMPLIFY": {
      const digest = sha256(
        msg.amplifier + msg.originalPing.id + msg.timestamp,
      );
      return BOUND_AMPLIFY_PREFIX + digest.slice(BOUND_AMPLIFY_PREFIX.length);
    }
    default:
      return msg.id;
  }
}

function signatureText(msg) {
  switch (msg.type) {
    case "HEARTBEAT":
      return `seq:${msg.seq}`;
    case "LEAVE":
      return `type:LEAVE:${msg.id}`;
    case "PING":
      return `ping:${msg.id}`;
    case "QUOTE":
      return `quote:${msg.id}`;
    case "COMMENT":
      return `comment:${msg.id}`;
    case "AMPLIFY":
      return `amplify:${msg.id}`;
    case "CATCHUP_REQUEST":
      return `catchup:request:${msg.id}:${msg.since}:${msg.cursor || 0}`;
    case "CATCHUP_RESPONSE":
      return `catchup:response:${msg.id}:${msg.cursor || 0}`;
    default:
      throw new Error(`Unsupported message type: ${msg.type}`);
  }
}

function signerId(msg) {
  if (["PING", "QUOTE", "COMMENT"].includes(msg.type)) return msg.author;
  if (msg.type === "AMPLIFY") return msg.amplifier;
  return msg.id;
}

function stripUnsupportedFields(msg) {
  delete msg.version;
  if (["PING", "QUOTE", "COMMENT", "AMPLIFY"].includes(msg.type)) {
    delete msg.nonce;
  }
  if (msg.type === "HEARTBEAT") {
    delete msg.timestamp;
    delete msg.transportKey;
  }
  if (msg.type === "LEAVE") {
    delete msg.timestamp;
    delete msg.transportKey;
  }
  return msg;
}

function signProtocolMessage(msg, privateKey) {
  stripUnsupportedFields(msg);
  if (["PING", "QUOTE", "COMMENT", "AMPLIFY"].includes(msg.type)) {
    msg.id = legacyMessageId(msg);
  }
  msg.sig = signMessage(signatureText(msg), privateKey);
  return msg;
}

function verifyProtocolMessage(msg, allowSnapshot = false) {
  const structurallyValid =
    validateMessage(msg) ||
    (allowSnapshot && validateQuotedPingSnapshot(msg));
  if (!structurallyValid) return false;

  try {
    if (["PING", "QUOTE", "COMMENT"].includes(msg.type)) {
      if (legacyMessageId(msg) !== msg.id) return false;
    }
    if (
      msg.type === "AMPLIFY" &&
      msg.id.startsWith(BOUND_AMPLIFY_PREFIX) &&
      legacyMessageId(msg) !== msg.id
    ) {
      return false;
    }

    const key = createPublicKey(signerId(msg));
    if (!verifySignature(signatureText(msg), msg.sig, key)) return false;
    if (msg.type === "HEARTBEAT" && !verifyPoW(msg.id, msg.nonce)) return false;

    if (msg.type === "AMPLIFY") {
      return verifyProtocolMessage(msg.originalPing, true);
    }
    if (msg.type === "QUOTE") {
      return (
        msg.quotedPing.id === msg.quoteOf &&
        verifyProtocolMessage(msg.quotedPing, true)
      );
    }
    if (msg.type === "CATCHUP_RESPONSE") {
      return msg.messages.every((nested) =>
        verifyProtocolMessage(compactCatchupMessage(nested)),
      );
    }
    return true;
  } catch {
    return false;
  }
}

function compactSignedSnapshot(msg) {
  if (!msg) return null;
  const snapshot = {
    type: msg.type,
    id: msg.id,
    author: msg.author,
    username: msg.username,
    content: msg.content,
    timestamp: msg.timestamp,
    sig: msg.sig,
    swarmId: msg.swarmId,
    topic: msg.topic,
  };
  if (msg.type === "QUOTE") snapshot.quoteOf = msg.quoteOf;
  return Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => value !== undefined),
  );
}

function compactTransportMessage(msg) {
  const copy = { ...msg };
  for (const field of [
    "likes",
    "amplifiedBy",
    "comments",
    "notes",
    "noteCounts",
    "receivedAt",
    "version",
  ]) {
    delete copy[field];
  }
  if (["PING", "QUOTE", "COMMENT", "AMPLIFY"].includes(copy.type)) {
    delete copy.nonce;
  }
  return copy;
}

module.exports = {
  PROTOCOL_VERSION,
  BOUND_AMPLIFY_PREFIX,
  compactSignedSnapshot,
  compactTransportMessage,
  legacyMessageId,
  messageId: legacyMessageId,
  signProtocolMessage,
  signatureText,
  signingText: signatureText,
  verifyProtocolMessage,
};
