const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

process.env.WEB_ALLOWED_HOSTS = "localhost:3000";
process.env.WEB_AUTH = "";

const { setupRoutes } = require("../src/web/routes");

function request(port, { method = "GET", path = "/api/health", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path,
      headers: { Host: "localhost:3000", ...headers },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("web boundary sets CSP and rejects DNS rebinding and cross-site writes", async (t) => {
  const app = express();
  const connections = new Set();
  const identity = { id: "30".repeat(44), username: "Test" };
  const peerManager = { size: 1, totalUniquePeers: 1 };
  const swarm = {
    getSwarm: () => ({ connections }),
    joinSwarm: () => 1,
    leaveSwarm: () => 1,
  };
  const sseManager = { addClient: () => false, removeClient() {} };
  const diagnostics = { getStats: () => ({}) };
  const pingStore = {
    getAll: () => [],
    getByAuthor: () => [],
    getUsername: () => null,
    get: () => null,
    getPingsSince: () => [],
  };
  setupRoutes(app, identity, peerManager, swarm, sseManager, diagnostics, pingStore, null);

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = server.address().port;

  const health = await request(port);
  assert.equal(health.status, 200);
  assert.match(health.headers["content-security-policy"], /script-src 'self'/);
  assert.doesNotMatch(health.headers["content-security-policy"], /unsafe-inline[^;]*script/);
  assert.doesNotMatch(health.headers["content-security-policy"], /cdnjs/);

  const icons = await request(port, { path: "/assets/fontawesome/css/all.min.css" });
  assert.equal(icons.status, 200);

  const rebinding = await request(port, { headers: { Host: "attacker.example" } });
  assert.equal(rebinding.status, 421);

  const crossSite = await request(port, {
    method: "POST",
    path: "/api/swarm/join",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "19",
      "Sec-Fetch-Site": "cross-site",
    },
    body: '{"name":"security"}',
  });
  assert.equal(crossSite.status, 403);

  const crossScheme = await request(port, {
    method: "POST",
    path: "/api/swarm/join",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "19",
      Origin: "https://localhost:3000",
    },
    body: '{"name":"security"}',
  });
  assert.equal(crossScheme.status, 403);
});
