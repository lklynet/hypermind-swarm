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
    "megaNode",
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

const CATCHUP_REQUEST_FIELDS = ["type", "id", "since", "cursor", "sig"];

const CATCHUP_RESPONSE_FIELDS = ["type", "id", "messages", "cursor", "hasMore", "sig"];

module.exports = {
    HEARTBEAT_FIELDS,
    LEAVE_FIELDS,
    PING_FIELDS,
    AMPLIFY_FIELDS,
    QUOTE_FIELDS,
    COMMENT_FIELDS,
    CATCHUP_REQUEST_FIELDS,
    CATCHUP_RESPONSE_FIELDS,
};
