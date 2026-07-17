const fs = require("fs");
const express = require("express");
const path = require("path");
const { generateAvatar } = require("../utils/avatar");
const { getSwarmId } = require("../utils/swarm-utils");
const { setupPingRoutes } = require("./routes/ping-routes");
const { setupProfileRoutes } = require("./routes/profile-routes");
const {
  MAX_MESSAGE_SIZE,
  VISUAL_LIMIT,
  GIPHY_API_KEY,
} = require("../config/constants");
const { AuthManager } = require("./auth");

const HTML_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "../../public/index.html"),
  "utf-8",
);

const setupRoutes = (
  app,
  identity,
  peerManager,
  swarm,
  sseManager,
  diagnostics,
  pingStore,
  persistenceManager,
) => {
  let authConfig = process.env.WEB_AUTH || "";
  const authManager = new AuthManager(authConfig);
  authConfig = "";
  process.env.WEB_AUTH = "";

  app.use(express.json({ limit: `${Math.max(MAX_MESSAGE_SIZE * 4, 8192)}b` }));
  app.use(express.static(path.join(__dirname, "../../public")));

  app.get("/api/auth/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      enabled: authManager.enabled,
      authenticated: authManager.isAuthenticated(req),
    });
  });

  app.post("/api/auth/login", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!authManager.enabled) {
      return res.json({ success: true, enabled: false });
    }

    const { username, password } = req.body || {};
    if (!authManager.verifyCredentials(username, password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    authManager.createSession(req, res);
    return res.json({ success: true, enabled: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    authManager.clearSession(req, res);
    res.json({ success: true });
  });

  app.use("/api", (req, res, next) => {
    if (!authManager.enabled) return next();
    if (
      req.path === "/auth/status" ||
      req.path === "/auth/login" ||
      req.path === "/auth/logout"
    ) {
      return next();
    }
    if (
      req.method === "GET" ||
      req.method === "HEAD" ||
      req.method === "OPTIONS"
    ) {
      return next();
    }
    if (authManager.isAuthenticated(req)) return next();
    return res.status(401).json({ error: "Unauthorized" });
  });

  const deps = {
    identity,
    peerManager,
    swarm,
    sseManager,
    diagnostics,
    pingStore,
    persistenceManager,
  };

  app.get("/", (req, res) => {
    const html = HTML_TEMPLATE.replace(/\{\{COUNT\}\}/g, peerManager.size)
      .replace(
        /\{\{ID\}\}/g,
        identity.username || "..." + identity.id.slice(-8),
      )
      .replace(/\{\{DIRECT\}\}/g, swarm.getSwarm().connections.size)
      .replace(/\{\{VISUAL_LIMIT\}\}/g, VISUAL_LIMIT);
    res.send(html);
  });

  app.get("/api/avatar/:id", async (req, res) => {
    try {
      const svg = await generateAvatar(req.params.id);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.send(svg);
    } catch {
      res.status(500).send("Error generating avatar");
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      id: identity.id,
      username: identity.username,
      peers: peerManager.size,
      connections: swarm.getSwarm().connections.size,
      timestamp: Date.now(),
    });
  });

  app.get("/api/stats", (req, res) => {
    res.json({
      id: identity.id,
      username: identity.username,
      peers: peerManager.size,
      connections: swarm.getSwarm().connections.size,
    });
  });

  app.get("/events", (req, res) => {
    if (!sseManager.addClient(res)) {
      res.status(503).json({ error: "Server at capacity" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    if (res.flushHeaders) res.flushHeaders();
    res.write("retry: 3000\n");
    res.write(": ok\n\n");
    res.write(
      `data: ${JSON.stringify({
        type: "INIT",
        count: peerManager.size,
        totalUnique: peerManager.totalUniquePeers,
        direct: swarm.getSwarm().connections.size,
        id: identity.id,
        username: identity.username,
        visualLimit: VISUAL_LIMIT,
        diagnostics: diagnostics.getStats(),
        peers: peerManager.getPeersWithIps(),
      })}\n\n`,
    );
    if (res.flush) res.flush();
    req.on("close", () => sseManager.removeClient(res));
  });

  app.post("/api/swarm/join", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const normalized = name.trim().toLowerCase();
    res.json({
      success: true,
      id: swarm.joinSwarm(normalized),
      name: normalized,
    });
  });

  app.post("/api/swarm/leave", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const normalized = name.trim().toLowerCase();
    res.json({
      success: true,
      id: swarm.leaveSwarm(normalized),
      name: normalized,
    });
  });

  app.post("/api/swarm/id", (req, res) => {
    const normalized = (req.body.name || "").trim().toLowerCase();
    res.json({ id: getSwarmId(normalized) });
  });

  app.get("/api/gif/search", async (req, res) => {
    if (!GIPHY_API_KEY) {
      return res
        .status(500)
        .json({ error: "Server Configuration Error: Missing GIPHY API Key" });
    }

    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Query required" });

    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      q: query,
      limit: req.query.limit || 20,
      offset: req.query.offset || 0,
      rating: "g",
      lang: "en",
    });

    try {
      const apiRes = await fetch(
        `https://api.giphy.com/v1/gifs/search?${params}`,
      );
      const json = await apiRes.json();
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          error: "GIPHY Upstream Error",
          status: apiRes.status,
          details: json,
        });
      }
      res.json(json);
    } catch (e) {
      res.status(500).json({ error: "Network Request Failed", message: e.message });
    }
  });

  setupProfileRoutes(app, deps);
  setupPingRoutes(app, deps);
};

module.exports = { setupRoutes };
