const test = require("node:test");
const assert = require("node:assert/strict");
const { AuthManager } = require("../src/web/auth");
const { SSEManager } = require("../src/web/sse");

function request(cookie = "") {
  return { secure: false, headers: { cookie, "user-agent": "test-agent" } };
}

function response() {
  const headers = new Map();
  return {
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    getHeader: (name) => headers.get(name.toLowerCase()),
    write() {},
    end() {},
  };
}

test("legacy short WEB_AUTH passwords remain usable", () => {
  const auth = new AuthManager("admin:legacy");

  assert.equal(auth.enabled, true);
  assert.equal(auth.verifyCredentials("admin", "legacy"), true);
  assert.equal(auth.verifyCredentials("admin", "wrong"), false);
});

test("auth sessions are HttpOnly, strict, bounded, and user-agent bound", () => {
  process.env.WEB_AUTH_MAX_SESSIONS = "2";
  const auth = new AuthManager("admin:correct horse battery staple");
  const req = request();
  const res = response();
  auth.createSession(req, res);
  const cookie = res.getHeader("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);

  const pair = cookie.split(";")[0];
  assert.equal(auth.isAuthenticated(request(pair)), true);
  assert.equal(auth.isAuthenticated({ ...request(pair), headers: { cookie: pair, "user-agent": "other" } }), false);
  assert.equal(auth.isAuthenticated(request("hm_auth=%")), false);
  assert.equal(auth.verifyCredentials({}, "correct horse battery staple"), false);

  auth.createSession(req, response());
  auth.createSession(req, response());
  auth.createSession(req, response());
  assert.ok(auth.sessions.size <= 2);
});

test("SSE manager enforces a per-client-key connection cap", () => {
  process.env.MAX_SSE_CLIENTS_PER_IP = "2";
  const manager = new SSEManager();
  const first = response();
  const second = response();
  const third = response();
  assert.equal(manager.addClient(first, "127.0.0.1"), true);
  assert.equal(manager.addClient(second, "127.0.0.1"), true);
  assert.equal(manager.addClient(third, "127.0.0.1"), false);
  manager.removeClient(first);
  assert.equal(manager.addClient(third, "127.0.0.1"), true);
  manager.cleanup();
});
