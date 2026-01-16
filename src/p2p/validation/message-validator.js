const {
    MAX_RELAY_HOPS,
    MAX_CONTENT_LENGTH,
    MAX_USERNAME_LENGTH,
    MAX_SEQUENCE_NUMBER,
    MAX_TTL,
    MAX_MESSAGE_SIZE,
} = require("../../config/constants");

const {
    HEARTBEAT_FIELDS,
    LEAVE_FIELDS,
    PING_FIELDS,
    AMPLIFY_FIELDS,
    COMMENT_FIELDS,
} = require("./schemas");

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
        validateMessage(msg.originalPing) &&
        msg.amplifier &&
        msg.sig &&
        isValidNumber(msg.ttl, 0, MAX_TTL)
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
        isValidNumber(msg.ttl, 0, MAX_TTL)
    );
}

function validateMessage(msg) {
    if (!msg || typeof msg !== "object") return false;
    if (!msg.type) return false;

    const msgSize = JSON.stringify(msg).length;
    if (msgSize > MAX_MESSAGE_SIZE) return false;

    switch (msg.type) {
        case "HEARTBEAT":
            return validateHeartbeat(msg);
        case "LEAVE":
            return validateLeave(msg);
        case "PING":
            return validatePing(msg);
        case "AMPLIFY":
            return validateAmplify(msg, validateMessage);
        case "COMMENT":
            return validateComment(msg);
        default:
            return false;
    }
}

module.exports = { validateMessage };
