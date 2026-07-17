const fs = require("fs");
const express = require("express");
const path = require("path");
const { generateAvatar } = require("../utils/avatar");
const { getSwarmId } = require("../utils/swarm-utils");
const { setupPingRoutes } = require("./routes/ping-routes");
const { setupProfileRoutes } = require("./routes/profile-routes");
const {
  MAX_MESSAGE_SIZE,
  PORT,
  VISUAL_LIMIT,
  GIPHY_API_KEY,
} = require("../config/constants");
const { AuthManager } = require("./auth");

const ID_RE = /^[0-9a-f]{88}$/i;
const isValidTopic = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 64 &&
  !/[\u0000-\u001f\u007f]/.test(value);

function createFixedWindowLimiter({ windowMs, max, maxKeys = 5000 }) {
  const entries = new Map();
  return (key) => {
    const now = Date.now();
    if (!entries.has(key) && entries.size >= maxKeys) {
      entries.delete(entries.keys().next().value);
    }
    let entry = entries.get(key);
    if (!entry || now - entry.startedAt >= windowMs) entry = { count: 0, startedAt: now };
    entry.count += 1;
    entries.set(key, entry);
    return entry.count > max;
  };
}

const HTML_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "../../public/index.html"),
  "utf-8",
);
const FONTAWESOME_ROOT = path.dirname(
  require.resolve("@fortawesome/fontawesome-free/package.json"),
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
  const allowedHosts = new Set(
    (process.env.WEB_ALLOWED_HOSTS || `localhost:${PORT},127.0.0.1:${PORT},[::1]:${PORT}`)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const loginLimited = createFixedWindowLimiter({ windowMs: 60_000, max: 10 });
  const apiLimited = createFixedWindowLimiter({ windowMs: 60_000, max: 120 });
  authConfig = "";
  process.env.WEB_AUTH = "";

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), usb=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    next();
  });
  app.use((req, res, next) => {
    const requestHost = (req.get("host") || "").toLowerCase();
    if (!allowedHosts.has(requestHost)) {
      return res.status(421).json({ error: "Host rejected" });
    }
    next();
  });
  app.use(express.json({ limit: `${Math.max(MAX_MESSAGE_SIZE * 4, 8192)}b` }));
  app.get("/vendor/dompurify.js", (_req, res) => {
    res.sendFile(path.join(path.dirname(require.resolve("dompurify")), "purify.es.mjs"));
  });
  app.get("/assets/fontawesome/css/all.min.css", (_req, res) => {
    res.sendFile(path.join(FONTAWESOME_ROOT, "css/all.min.css"));
  });
  app.use(
    "/assets/fontawesome/webfonts",
    express.static(path.join(FONTAWESOME_ROOT, "webfonts"), { index: false }),
  );
  app.use(express.static(path.join(__dirname, "../../public")));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (unsafe && req.headers["sec-fetch-site"] === "cross-site") {
      return res.status(403).json({ error: "Cross-site request rejected" });
    }
    if (origin) {
      try {
        const expectedOrigin = `${req.protocol}://${req.get("host")}`;
        if (new URL(origin).origin !== expectedOrigin) {
          return res.status(403).json({ error: "Origin rejected" });
        }
      } catch {
        return res.status(403).json({ error: "Origin rejected" });
      }
    }
    if (req.path.startsWith("/api/") && apiLimited(req.ip || req.socket.remoteAddress)) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  });

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
    if (loginLimited(req.ip || req.socket.remoteAddress)) {
      return res.status(429).json({ error: "Too many login attempts" });
    }
    const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    if (!isLoopback && !req.secure) {
      return res.status(426).json({ error: "HTTPS is required for remote login" });
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
    if (!ID_RE.test(req.params.id)) return res.status(400).send("Invalid identity");
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
    if (!sseManager.addClient(res, req.ip || req.socket.remoteAddress || "unknown")) {
      res.status(503).json({ error: "Server at capacity" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
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
      })}\n\n`,
    );
    if (res.flush) res.flush();
    req.on("close", () => sseManager.removeClient(res));
  });

  app.post("/api/swarm/join", (req, res) => {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ error: "Missing name" });
    const normalized = name.trim().toLowerCase();
    if (!isValidTopic(normalized)) return res.status(400).json({ error: "Invalid swarm name" });
    res.json({
      success: true,
      id: swarm.joinSwarm(normalized),
      name: normalized,
    });
  });

  app.post("/api/swarm/leave", (req, res) => {
    const { name } = req.body || {};
    if (typeof name !== "string") return res.status(400).json({ error: "Missing name" });
    const normalized = name.trim().toLowerCase();
    if (!isValidTopic(normalized)) return res.status(400).json({ error: "Invalid swarm name" });
    res.json({
      success: true,
      id: swarm.leaveSwarm(normalized),
      name: normalized,
    });
  });

  app.post("/api/swarm/id", (req, res) => {
    if (req.body?.name !== undefined && typeof req.body.name !== "string") {
      return res.status(400).json({ error: "Invalid swarm name" });
    }
    const normalized = (req.body?.name || "").trim().toLowerCase();
    if (normalized && !isValidTopic(normalized)) return res.status(400).json({ error: "Invalid swarm name" });
    res.json({ id: getSwarmId(normalized) });
  });

  app.get("/api/gif/search", async (req, res) => {
    if (authManager.enabled && !authManager.isAuthenticated(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!GIPHY_API_KEY) {
      return res
        .status(500)
        .json({ error: "Server Configuration Error: Missing GIPHY API Key" });
    }

    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) return res.status(400).json({ error: "Query required" });
    if (query.length > 100) return res.status(400).json({ error: "Query too long" });

    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      q: query,
      limit: String(Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 20))),
      offset: String(Math.min(5000, Math.max(0, parseInt(req.query.offset, 10) || 0))),
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
