const HEARTBEAT_FIELDS = [
    "type",
    "id",
    "username",
    "seq",
    "hops",
    "nonce",
    "sig",
    "encKey",
    "swarmFilter",
    "coreKey",
];

const LEAVE_FIELDS = ["type", "id", "hops", "sig"];

const PING_FIELDS = [
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

const AMPLIFY_FIELDS = [
    "type",
    "id",
    "originalPing",
    "amplifier",
    "username",
    "timestamp",
    "sig",
    "ttl",
];

const QUOTE_FIELDS = [
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
    "quoteOf",
    "quotedPing",
];

const COMMENT_FIELDS = [
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

module.exports = {
    HEARTBEAT_FIELDS,
    LEAVE_FIELDS,
    PING_FIELDS,
    AMPLIFY_FIELDS,
    QUOTE_FIELDS,
    COMMENT_FIELDS,
};
