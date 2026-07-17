const assert = require("assert");
const { PingStore } = require("../src/state/pings");

const ping = {
  type: "PING",
  id: "ping1",
  author: "a",
  username: "u",
  content: "hello",
  timestamp: 1,
  sig: "s",
};

const comment = {
  type: "COMMENT",
  id: "c1",
  pingId: "ping1",
  author: "a",
  username: "u",
  content: "yo",
  timestamp: 2,
  sig: "s",
};

{
  const store = new PingStore(100, false);
  assert.strictEqual(store.addComment("ping1", comment), false);
  assert.strictEqual(store.add(ping), true);
  assert.strictEqual(store.get("ping1").comments.length, 1);
  assert.strictEqual(store.get("ping1").comments[0].id, "c1");
}

{
  const store = new PingStore(100, false);
  const withParent = {
    ...comment,
    originalPing: ping,
  };
  assert.strictEqual(store.addComment("ping1", withParent), true);
  assert.strictEqual(store.get("ping1").comments.length, 1);
}

console.log("comment-persist-replay: ok");
