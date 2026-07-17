const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

process.env.VERIFICATION_POW_PREFIX = "0";

const { signMessage } = require("../src/core/security");
const {
  BOUND_AMPLIFY_PREFIX,
  compactSignedSnapshot,
  legacyMessageId,
  signProtocolMessage,
  verifyProtocolMessage,
} = require("../src/p2p/validation/message-security");

function identity() {
  const keys = crypto.generateKeyPairSync("ed25519");
  const id = keys.publicKey.export({ type: "spki", format: "der" }).toString("hex");
  let nonce = 0;
  while (!crypto.createHash("sha256").update(id + nonce).digest("hex").startsWith("0")) nonce += 1;
  return { id, nonce, privateKey: keys.privateKey };
}

function legacyPing(author, overrides = {}) {
  const message = {
    type: "PING",
    author: author.id,
    username: "LegacyUser",
    content: "hello",
    timestamp: Date.now(),
    hops: 0,
    ttl: 10,
    swarmId: 1,
    topic: "security",
    ...overrides,
  };
  message.id = crypto
    .createHash("sha256")
    .update(message.author + message.content + message.timestamp)
    .digest("hex");
  message.sig = signMessage(`ping:${message.id}`, author.privateKey);
  return message;
}

test("creates and accepts the exact deployed ping wire format", () => {
  const author = identity();
  const message = signProtocolMessage({
    type: "PING",
    author: author.id,
    username: "CompatibleUser",
    content: "hello",
    timestamp: Date.now(),
    hops: 0,
    ttl: 10,
    swarmId: 1,
    topic: "security",
    nonce: author.nonce,
  }, author.privateKey);

  assert.equal(message.version, undefined);
  assert.equal(message.nonce, undefined);
  assert.equal(message.id, legacyMessageId(message));
  assert.equal(verifyProtocolMessage(message), true);
  assert.equal(verifyProtocolMessage({ ...message, content: "changed" }), false);
  assert.equal(verifyProtocolMessage({ ...message, timestamp: message.timestamp - 1 }), false);
});

test("accepts deployed legacy pings while strictly validating dangerous field types", () => {
  const author = identity();
  const message = legacyPing(author);
  assert.equal(verifyProtocolMessage(message), true);
  assert.equal(verifyProtocolMessage({ ...message, author: `\"><img src=x onerror=alert(1)>` }), false);
  assert.equal(verifyProtocolMessage({ ...message, topic: false }), false);
  assert.equal(verifyProtocolMessage({ ...message, swarmId: null }), false);
  assert.equal(verifyProtocolMessage({ ...message, username: 0 }), false);

  const descriptiveTopic = legacyPing(author, { topic: "security & privacy" });
  assert.equal(verifyProtocolMessage(descriptiveTopic), true);
  const controlTopic = legacyPing(author, { topic: "security\u0000privacy" });
  assert.equal(verifyProtocolMessage(controlTopic), false);

  // These fields were never covered by the deployed signature. They remain
  // compatibility data and must be escaped/sanitized by the renderer.
  assert.equal(verifyProtocolMessage({ ...message, username: "Renamed" }), true);
  assert.equal(verifyProtocolMessage({ ...message, topic: "other" }), true);
});

test("legacy comments and quotes interoperate and retain content authentication", () => {
  const originalAuthor = identity();
  const author = identity();
  const original = legacyPing(originalAuthor);

  const comment = {
    type: "COMMENT",
    pingId: original.id,
    author: author.id,
    username: "Commenter",
    content: "reply",
    timestamp: Date.now(),
    ttl: 6,
  };
  comment.id = crypto.createHash("sha256")
    .update(comment.author + comment.pingId + comment.content + comment.timestamp)
    .digest("hex");
  comment.sig = signMessage(`comment:${comment.id}`, author.privateKey);
  assert.equal(verifyProtocolMessage(comment), true);
  assert.equal(verifyProtocolMessage({ ...comment, content: "forged" }), false);

  const quote = {
    type: "QUOTE",
    author: author.id,
    username: "Quoter",
    content: "quoted",
    timestamp: Date.now(),
    hops: 0,
    ttl: 10,
    swarmId: 1,
    topic: "security",
    quoteOf: original.id,
    quotedPing: compactSignedSnapshot(original),
  };
  quote.id = crypto.createHash("sha256")
    .update(quote.author + quote.quoteOf + quote.content + quote.timestamp)
    .digest("hex");
  quote.sig = signMessage(`quote:${quote.id}`, author.privateKey);
  assert.equal(verifyProtocolMessage(quote), true);
  assert.equal(verifyProtocolMessage({ ...quote, quoteOf: "00".repeat(32) }), false);
});

test("accepts legacy amplifies and target-binds amplifies created by hardened nodes", () => {
  const author = identity();
  const amplifier = identity();
  const original = legacyPing(author);
  const other = legacyPing(author, { content: "other", timestamp: Date.now() + 1 });

  const legacy = {
    type: "AMPLIFY",
    id: crypto.randomBytes(32).toString("hex"),
    originalPing: compactSignedSnapshot(original),
    amplifier: amplifier.id,
    username: "Amplifier",
    timestamp: Date.now(),
    ttl: 10,
  };
  legacy.sig = signMessage(`amplify:${legacy.id}`, amplifier.privateKey);
  assert.equal(verifyProtocolMessage(legacy), true);
  assert.equal(
    verifyProtocolMessage({ ...legacy, originalPing: compactSignedSnapshot(other) }),
    true,
    "deployed amplifies did not bind their target",
  );

  const hardened = signProtocolMessage({
    type: "AMPLIFY",
    originalPing: compactSignedSnapshot(original),
    amplifier: amplifier.id,
    username: "Amplifier",
    timestamp: Date.now(),
    ttl: 10,
  }, amplifier.privateKey);
  assert.ok(hardened.id.startsWith(BOUND_AMPLIFY_PREFIX));
  assert.equal(verifyProtocolMessage(hardened), true);
  assert.equal(
    verifyProtocolMessage({ ...hardened, originalPing: compactSignedSnapshot(other) }),
    false,
  );
});

test("legacy catch-up signatures interoperate while every nested message is verified", () => {
  const author = identity();
  const megaNode = identity();
  const nested = legacyPing(author);
  const response = {
    type: "CATCHUP_RESPONSE",
    id: megaNode.id,
    messages: [{ ...nested, likes: 3, comments: [], notes: [], noteCounts: {} }],
    cursor: null,
    hasMore: false,
  };
  response.sig = signMessage(
    `catchup:response:${response.id}:0`,
    megaNode.privateKey,
  );

  assert.equal(verifyProtocolMessage(response), true);
  response.messages[0].content = "forged";
  assert.equal(verifyProtocolMessage(response), false);
});

test("legacy heartbeat and leave control messages interoperate", () => {
  const node = identity();
  const heartbeat = {
    type: "HEARTBEAT",
    id: node.id,
    username: "Node",
    seq: 1,
    hops: 0,
    nonce: node.nonce,
    encKey: "11".repeat(32),
    swarmFilter: "22".repeat(32),
    coreKey: "33".repeat(32),
    megaNode: true,
  };
  heartbeat.sig = signMessage("seq:1", node.privateKey);
  assert.equal(verifyProtocolMessage(heartbeat), true);
  assert.equal(verifyProtocolMessage({ ...heartbeat, seq: 2 }), false);
  assert.equal(verifyProtocolMessage({ ...heartbeat, coreKey: "44".repeat(32) }), true);
  assert.equal(verifyProtocolMessage({ ...heartbeat, transportKey: "55".repeat(32) }), false);

  const leave = {
    type: "LEAVE",
    id: node.id,
    hops: 0,
    sig: signMessage(`type:LEAVE:${node.id}`, node.privateKey),
  };
  assert.equal(verifyProtocolMessage(leave), true);
  assert.equal(verifyProtocolMessage({ ...leave, id: identity().id }), false);
});
