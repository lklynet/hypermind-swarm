const express = require("express");
const path = require("path");
const { setupSSERoutes } = require("./routes/sse-routes");
const { setupPingRoutes } = require("./routes/ping-routes");
const { setupProfileRoutes } = require("./routes/profile-routes");
const { setupSwarmRoutes } = require("./routes/swarm-routes");
const { setupStaticRoutes } = require("./routes/static-routes");
const { setupGifRoutes } = require("./routes/gif-routes");
const { setupHealthRoutes } = require("./routes/health-routes");
const { MAX_MESSAGE_SIZE } = require("../config/constants");
const { AuthManager } = require("./auth");

const setupRoutes = (
  app,
  identity,
  peerManager,
  swarm,
  sseManager,
  diagnostics,
  pingStore,
  persistenceManager
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
    if (req.path === "/auth/status" || req.path === "/auth/login" || req.path === "/auth/logout") {
      return next();
    }
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
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

  setupStaticRoutes(app, deps);
  setupHealthRoutes(app, deps);
  setupSSERoutes(app, deps);
  setupProfileRoutes(app, deps);
  setupSwarmRoutes(app, deps);
  setupPingRoutes(app, deps);
  setupGifRoutes(app);
};

module.exports = { setupRoutes };
