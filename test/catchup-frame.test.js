const assert = require("assert");
const crypto = require("crypto");
const { CatchupHandler } = require("../src/p2p/handlers/catchup-handler");
const { signMessage } = require("../src/core/security");
const { MAX_SOCKET_BUFFER_SIZE } = require("../src/config/constants");

const keys = crypto.generateKeyPairSync("ed25519");
const remoteKeys = crypto.generateKeyPairSync("ed25519");
const id = keys.publicKey.export({ type: "spki", format: "der" }).toString("hex");
const remoteId = remoteKeys.publicKey.export({ type: "spki", format: "der" }).toString("hex");
const messages = Array.from({ length: 50 }, (_, i) => ({
  type: "PING",
  id: `ping-${i}`,
  author: remoteId,
  content: "x".repeat(280),
  timestamp: Date.now() + i,
  sig: "a".repeat(128),
  hops: 0,
  ttl: 10,
}));

let response;
const handler = new CatchupHandler({
  diagnostics: { increment() {} },
  identity: { id, privateKey: keys.privateKey },
  isMegaNode: true,
  pingStore: {
    getMessagesSince(_since, cursor, batchSize) {
      const start = cursor || 0;
      const batch = messages.slice(start, start + batchSize);
      const hasMore = start + batchSize < messages.length;
      return { messages: batch, cursor: hasMore ? start + batchSize : null, hasMore };
    },
  },
});
const since = Date.now() - 1000;

handler.handleRequest(
  {
    id: remoteId,
    since,
    cursor: null,
    sig: signMessage(`catchup:request:${remoteId}:${since}:0`, remoteKeys.privateKey),
  },
  { write: (data) => { response = data; } }
);

assert.ok(
  Buffer.byteLength(response) <= MAX_SOCKET_BUFFER_SIZE,
  "catch-up response exceeds the legacy socket limit"
);
console.log("catchup-frame: ok");
