const {
  MAX_RELAY_HOPS,
  MAX_CONTENT_LENGTH,
  MAX_USERNAME_LENGTH,
  MAX_SEQUENCE_NUMBER,
  MAX_TTL,
  MAX_MESSAGE_SIZE,
  MAX_CATCHUP_MESSAGE_SIZE,
} = require("../../config/constants");

const HEARTBEAT_FIELDS = [
  "type", "id", "username", "seq", "hops", "nonce", "sig",
  "encKey", "swarmFilter", "coreKey", "megaNode",
];
const LEAVE_FIELDS = ["type", "id", "hops", "sig"];
const PING_FIELDS = [
  "type", "id", "author", "username", "content", "timestamp", "sig",
  "hops", "ttl", "swarmId", "topic",
];
const AMPLIFY_FIELDS = [
  "type", "id", "originalPing", "amplifier", "username", "timestamp", "sig", "ttl",
];
const QUOTE_FIELDS = [
  "type", "id", "author", "username", "content", "timestamp", "sig",
  "hops", "ttl", "swarmId", "topic", "quoteOf", "quotedPing",
];
const COMMENT_FIELDS = [
  "type", "id", "pingId", "author", "username", "content", "timestamp", "sig", "ttl",
];
const CATCHUP_REQUEST_FIELDS = ["type", "id", "since", "cursor", "sig"];
const CATCHUP_RESPONSE_FIELDS = ["type", "id", "messages", "cursor", "hasMore", "sig"];
const QUOTED_PING_FIELDS = [
  "type", "id", "author", "username", "content", "timestamp", "sig",
  "swarmId", "topic", "quoteOf",
];

function hasOnlyAllowedFields(msg, allowedFields) {
  return Object.keys(msg).every((field) => allowedFields.includes(field));
}

function isValidNumber(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function isValidString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isHex(value, bytes) {
  return typeof value === "string" && value.length === bytes * 2 && /^[0-9a-f]+$/i.test(value);
}

function isIdentity(value) {
  return isHex(value, 44);
}

function isMessageId(value) {
  return isHex(value, 32);
}

function isSignature(value) {
  return isHex(value, 64);
}

function isOptionalString(value, maxLength) {
  return value === undefined || value === null || value === "" || isValidString(value, maxLength);
}

function isOptionalHex(value, bytes) {
  return value === undefined || value === null || isHex(value, bytes);
}

function isValidTopic(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isOptionalTopic(value) {
  return value === undefined || value === "" || isValidTopic(value);
}

function isOptionalSwarmId(value) {
  return value === undefined || isValidNumber(value, 0, 255);
}

function isValidTimestamp(value) {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= Date.now() + 5 * 60 * 1000
  );
}

function validateHeartbeat(msg) {
  return (
    hasOnlyAllowedFields(msg, HEARTBEAT_FIELDS) &&
    isIdentity(msg.id) &&
    isValidNumber(msg.seq, 0, MAX_SEQUENCE_NUMBER) &&
    isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
    isOptionalString(msg.username, MAX_USERNAME_LENGTH) &&
    Number.isSafeInteger(msg.nonce) && msg.nonce >= 0 &&
    isSignature(msg.sig) &&
    isOptionalHex(msg.encKey, 32) &&
    isOptionalHex(msg.swarmFilter, 32) &&
    isOptionalHex(msg.coreKey, 32) &&
    (msg.megaNode === undefined || typeof msg.megaNode === "boolean")
  );
}

function validateLeave(msg) {
  return (
    hasOnlyAllowedFields(msg, LEAVE_FIELDS) &&
    isIdentity(msg.id) &&
    isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
    isSignature(msg.sig)
  );
}

function validatePing(msg) {
  return (
    hasOnlyAllowedFields(msg, PING_FIELDS) &&
    isMessageId(msg.id) &&
    isIdentity(msg.author) &&
    isValidString(msg.content, MAX_CONTENT_LENGTH) &&
    isOptionalString(msg.username, MAX_USERNAME_LENGTH) &&
    isValidTimestamp(msg.timestamp) &&
    isSignature(msg.sig) &&
    isValidNumber(msg.ttl, 0, MAX_TTL) &&
    isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
    isOptionalSwarmId(msg.swarmId) &&
    isOptionalTopic(msg.topic)
  );
}

function validateQuotedPingSnapshot(ping) {
  return (
    ping &&
    typeof ping === "object" &&
    hasOnlyAllowedFields(ping, QUOTED_PING_FIELDS) &&
    (ping.type === "PING" || ping.type === "QUOTE") &&
    isMessageId(ping.id) &&
    isIdentity(ping.author) &&
    isValidString(ping.content, MAX_CONTENT_LENGTH) &&
    isOptionalString(ping.username, MAX_USERNAME_LENGTH) &&
    isValidTimestamp(ping.timestamp) &&
    isSignature(ping.sig) &&
    isOptionalSwarmId(ping.swarmId) &&
    isOptionalTopic(ping.topic) &&
    (ping.type === "QUOTE" ? isMessageId(ping.quoteOf) : ping.quoteOf === undefined)
  );
}

function validateAmplify(msg) {
  return (
    hasOnlyAllowedFields(msg, AMPLIFY_FIELDS) &&
    isMessageId(msg.id) &&
    msg.originalPing &&
    (msg.originalPing.type === "PING" || msg.originalPing.type === "QUOTE") &&
    (validateMessage(msg.originalPing) || validateQuotedPingSnapshot(msg.originalPing)) &&
    isIdentity(msg.amplifier) &&
    isOptionalString(msg.username, MAX_USERNAME_LENGTH) &&
    (msg.timestamp === undefined || isValidTimestamp(msg.timestamp)) &&
    isSignature(msg.sig) &&
    isValidNumber(msg.ttl, 0, MAX_TTL)
  );
}

function validateQuote(msg) {
  return (
    hasOnlyAllowedFields(msg, QUOTE_FIELDS) &&
    isMessageId(msg.id) &&
    isIdentity(msg.author) &&
    isValidString(msg.content, MAX_CONTENT_LENGTH) &&
    isOptionalString(msg.username, MAX_USERNAME_LENGTH) &&
    isValidTimestamp(msg.timestamp) &&
    isSignature(msg.sig) &&
    isValidNumber(msg.ttl, 0, MAX_TTL) &&
    isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
    isMessageId(msg.quoteOf) &&
    isOptionalSwarmId(msg.swarmId) &&
    isOptionalTopic(msg.topic) &&
    validateQuotedPingSnapshot(msg.quotedPing)
  );
}

function validateComment(msg) {
  return (
    hasOnlyAllowedFields(msg, COMMENT_FIELDS) &&
    isMessageId(msg.id) &&
    isMessageId(msg.pingId) &&
    isIdentity(msg.author) &&
    isValidString(msg.content, MAX_CONTENT_LENGTH) &&
    isOptionalString(msg.username, MAX_USERNAME_LENGTH) &&
    isValidTimestamp(msg.timestamp) &&
    isSignature(msg.sig) &&
    isValidNumber(msg.ttl, 0, MAX_TTL)
  );
}

function validateCatchupRequest(msg) {
  return (
    hasOnlyAllowedFields(msg, CATCHUP_REQUEST_FIELDS) &&
    isIdentity(msg.id) &&
    isValidTimestamp(msg.since) &&
    (msg.cursor === null || (Number.isSafeInteger(msg.cursor) && msg.cursor >= 0)) &&
    isSignature(msg.sig)
  );
}

function compactCatchupMessage(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const copy = { ...msg };
  for (const field of ["likes", "amplifiedBy", "comments", "notes", "noteCounts", "receivedAt"]) {
    delete copy[field];
  }
  return copy;
}

function validateCatchupResponse(msg) {
  return (
    hasOnlyAllowedFields(msg, CATCHUP_RESPONSE_FIELDS) &&
    isIdentity(msg.id) &&
    Array.isArray(msg.messages) &&
    msg.messages.every((nested) => {
      const compact = compactCatchupMessage(nested);
      return ["PING", "QUOTE", "COMMENT", "AMPLIFY"].includes(compact?.type) && validateMessage(compact);
    }) &&
    (msg.cursor === null || (Number.isSafeInteger(msg.cursor) && msg.cursor >= 0)) &&
    typeof msg.hasMore === "boolean" &&
    isSignature(msg.sig)
  );
}

function validateMessage(msg) {
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return false;

  let msgSize;
  try {
    msgSize = Buffer.byteLength(JSON.stringify(msg), "utf8");
  } catch {
    return false;
  }

  if (msg.type === "CATCHUP_RESPONSE") {
    return msgSize <= MAX_CATCHUP_MESSAGE_SIZE && validateCatchupResponse(msg);
  }
  if (msgSize > MAX_MESSAGE_SIZE) return false;

  switch (msg.type) {
    case "HEARTBEAT": return validateHeartbeat(msg);
    case "LEAVE": return validateLeave(msg);
    case "PING": return validatePing(msg);
    case "AMPLIFY": return validateAmplify(msg);
    case "QUOTE": return validateQuote(msg);
    case "COMMENT": return validateComment(msg);
    case "CATCHUP_REQUEST": return validateCatchupRequest(msg);
    default: return false;
  }
}

module.exports = {
  compactCatchupMessage,
  validateMessage,
  validateQuotedPingSnapshot,
};
