const test = require("node:test");
const assert = require("node:assert/strict");

test("the default discovery topic remains the existing v1 topic", () => {
  process.env.TOPIC_NAME = "";
  delete require.cache[require.resolve("../src/config/constants")];
  const { TOPIC_NAME } = require("../src/config/constants");
  assert.equal(TOPIC_NAME, "hypermind-swarm-v1");
});
