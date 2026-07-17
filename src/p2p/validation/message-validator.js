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
    "originalPing",
];
const CATCHUP_REQUEST_FIELDS = ["type", "id", "since", "cursor", "sig"];
const CATCHUP_RESPONSE_FIELDS = ["type", "id", "messages", "cursor", "hasMore", "sig"];

const QUOTED_PING_FIELDS = [
    "type",
    "id",
    "author",
    "username",
    "content",
    "timestamp",
    "sig",
    "swarmId",
    "topic",
    "quoteOf",
];

function hasOnlyAllowedFields(msg, allowedFields) {
    return Object.keys(msg).every((f) => allowedFields.includes(f));
}

function isValidNumber(value, min, max) {
    return typeof value === "number" && value >= min && value <= max;
}

function isValidString(value, maxLength) {
    return typeof value === "string" && value.length <= maxLength;
}

function isValidTimestamp(value) {
    return typeof value === "number" && value > 0;
}

function validateHeartbeat(msg) {
    return (
        hasOnlyAllowedFields(msg, HEARTBEAT_FIELDS) &&
        msg.id &&
        isValidNumber(msg.seq, 0, MAX_SEQUENCE_NUMBER) &&
        isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
        (!msg.username || msg.username.length <= MAX_USERNAME_LENGTH) &&
        msg.nonce &&
        msg.sig
    );
}

function validateLeave(msg) {
    return (
        hasOnlyAllowedFields(msg, LEAVE_FIELDS) &&
        msg.id &&
        isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
        msg.sig
    );
}

function validatePing(msg) {
    return (
        hasOnlyAllowedFields(msg, PING_FIELDS) &&
        msg.id &&
        msg.author &&
        msg.content &&
        isValidString(msg.content, MAX_CONTENT_LENGTH) &&
        (!msg.username || msg.username.length <= MAX_USERNAME_LENGTH) &&
        isValidTimestamp(msg.timestamp) &&
        msg.sig &&
        isValidNumber(msg.ttl, 0, MAX_TTL) &&
        isValidNumber(msg.hops, 0, MAX_RELAY_HOPS)
    );
}

function validateAmplify(msg, validateMessage) {
    return (
        hasOnlyAllowedFields(msg, AMPLIFY_FIELDS) &&
        msg.id &&
        msg.originalPing &&
        (validateMessage(msg.originalPing) ||
            validateQuotedPingSnapshot(msg.originalPing)) &&
        msg.amplifier &&
        (!msg.username || msg.username.length <= MAX_USERNAME_LENGTH) &&
        (!msg.timestamp || isValidTimestamp(msg.timestamp)) &&
        msg.sig &&
        isValidNumber(msg.ttl, 0, MAX_TTL)
    );
}

function validateQuotedPingSnapshot(ping) {
    return (
        ping &&
        typeof ping === "object" &&
        hasOnlyAllowedFields(ping, QUOTED_PING_FIELDS) &&
        (ping.type === "PING" || ping.type === "QUOTE") &&
        ping.id &&
        ping.author &&
        ping.content &&
        isValidString(ping.content, MAX_CONTENT_LENGTH) &&
        (!ping.username || ping.username.length <= MAX_USERNAME_LENGTH) &&
        isValidTimestamp(ping.timestamp) &&
        ping.sig &&
        (ping.type !== "QUOTE" || Boolean(ping.quoteOf))
    );
}

function validateQuote(msg) {
    return (
        hasOnlyAllowedFields(msg, QUOTE_FIELDS) &&
        msg.id &&
        msg.author &&
        msg.content &&
        isValidString(msg.content, MAX_CONTENT_LENGTH) &&
        (!msg.username || msg.username.length <= MAX_USERNAME_LENGTH) &&
        isValidTimestamp(msg.timestamp) &&
        msg.sig &&
        isValidNumber(msg.ttl, 0, MAX_TTL) &&
        isValidNumber(msg.hops, 0, MAX_RELAY_HOPS) &&
        msg.quoteOf &&
        validateQuotedPingSnapshot(msg.quotedPing)
    );
}

function validateComment(msg) {
    return (
        hasOnlyAllowedFields(msg, COMMENT_FIELDS) &&
        msg.id &&
        msg.pingId &&
        msg.author &&
        msg.content &&
        isValidString(msg.content, MAX_CONTENT_LENGTH) &&
        (!msg.username || msg.username.length <= MAX_USERNAME_LENGTH) &&
        isValidTimestamp(msg.timestamp) &&
        msg.sig &&
        isValidNumber(msg.ttl, 0, MAX_TTL) &&
        (!msg.originalPing ||
            (validateQuotedPingSnapshot(msg.originalPing) &&
                msg.originalPing.id === msg.pingId))
    );
}

function validateCatchupRequest(msg) {
    return (
        hasOnlyAllowedFields(msg, CATCHUP_REQUEST_FIELDS) &&
        msg.id &&
        isValidTimestamp(msg.since) &&
        (!msg.cursor || typeof msg.cursor === "number") &&
        msg.sig
    );
}

function validateCatchupResponse(msg) {
    return (
        hasOnlyAllowedFields(msg, CATCHUP_RESPONSE_FIELDS) &&
        msg.id &&
        Array.isArray(msg.messages) &&
        msg.messages.every((m) => validateMessage(m)) &&
        (!msg.cursor || typeof msg.cursor === "number") &&
        typeof msg.hasMore === "boolean" &&
        msg.sig
    );
}

function validateMessage(msg) {
    if (!msg || typeof msg !== "object") return false;
    if (!msg.type) return false;

    const msgSize = JSON.stringify(msg).length;

    switch (msg.type) {
        case "HEARTBEAT":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validateHeartbeat(msg);
        case "LEAVE":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validateLeave(msg);
        case "PING":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validatePing(msg);
        case "AMPLIFY":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validateAmplify(msg, validateMessage);
        case "QUOTE":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validateQuote(msg);
        case "COMMENT":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validateComment(msg);
        case "CATCHUP_REQUEST":
            if (msgSize > MAX_MESSAGE_SIZE) return false;
            return validateCatchupRequest(msg);
        case "CATCHUP_RESPONSE":
            if (msgSize > MAX_CATCHUP_MESSAGE_SIZE) return false;
            return validateCatchupResponse(msg);
        default:
            return false;
    }
}

module.exports = { validateMessage };
