const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { signMessage } = require("../core/security");
const { generateAvatar } = require("../utils/avatar");
const { CHAT_RATE_LIMIT, VISUAL_LIMIT } = require("../config/constants");

const HTML_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "../../public/index.html"),
  "utf-8"
);

const setupRoutes = (
  app,
  identity,
  peerManager,
  swarm,
  sseManager,
  diagnostics,
  pingStore
) => {
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../../public")));

  app.get("/", (req, res) => {
    const count = peerManager.size;
    const directPeers = swarm.getSwarm().connections.size;

    const html = HTML_TEMPLATE.replace(/\{\{COUNT\}\}/g, count)
      .replace(
        /\{\{ID\}\}/g,
        identity.username || "..." + identity.id.slice(-8)
      )
      .replace(/\{\{DIRECT\}\}/g, directPeers)
      .replace(/\{\{VISUAL_LIMIT\}\}/g, VISUAL_LIMIT);

    res.send(html);
  });

  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseManager.addClient(res);

    const data = JSON.stringify({
      type: "INIT",
      count: peerManager.size,
      totalUnique: peerManager.totalUniquePeers,
      direct: swarm.getSwarm().connections.size,
      id: identity.id,
      username: identity.username,
      diagnostics: diagnostics.getStats(),
      peers: peerManager.getPeersWithIps(),
    });
    res.write(`data: ${data}\n\n`);

    req.on("close", () => {
      sseManager.removeClient(res);
    });
  });

  app.get("/api/whoami", (req, res) => {
    res.json({ id: identity.id });
  });

  app.get("/api/pings", (req, res) => {
    res.json(pingStore.getAll());
  });

  app.get("/api/avatar/:id", (req, res) => {
    const { id } = req.params;
    try {
      const svg = generateAvatar(id);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.send(svg);
    } catch (e) {
      console.error(e);
      res.status(500).send("Error generating avatar");
    }
  });

  let pingHistory = [];

  app.post("/api/ping", (req, res) => {
    const now = Date.now();
    pingHistory = pingHistory.filter((time) => now - time < CHAT_RATE_LIMIT);

    if (pingHistory.length >= 5) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    pingHistory.push(now);

    const { content } = req.body;
    if (!content || typeof content !== "string" || content.length > 280) {
      return res.status(400).json({ error: "Invalid content" });
    }

    const timestamp = Date.now();
    const idBase = identity.id + content + timestamp;
    const msgId = crypto.createHash("sha256").update(idBase).digest("hex");

    const sig = signMessage(`ping:${msgId}`, identity.privateKey);

    const msg = {
      type: "PING",
      id: msgId,
      author: identity.id,
      username: identity.username,
      content,
      timestamp,
      sig,
      hops: 0,
      ttl: 6, // Default TTL
    };

    // Store locally
    if (pingStore.add(msg)) {
      // Auto-amplify (Pre-amplify)
      pingStore.like(msg.id, identity.id);

      // Broadcast to direct peers
      swarm.broadcast(msg);

      // Notify local SSE clients with updated state (likes: 1)
      const pingWithState = {
        ...msg,
        likes: 1,
        amplifiedBy: [identity.id]
      };
      sseManager.broadcast(pingWithState);

      res.json(msg);
    } else {
      res.status(400).json({ error: "Duplicate ping" });
    }
  });

  app.post("/api/amplify", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing ping ID" });

    const ping = pingStore.get(id);
    if (!ping) {
      return res.status(404).json({ error: "Ping not found" });
    }

    // Prevent double amplify (local check)
    if (ping.amplifiedBy && ping.amplifiedBy.has(identity.id)) {
        return res.status(400).json({ error: "Already amplified" });
    }

    // Prevent self-amplification
    if (ping.author === identity.id) {
        return res.status(400).json({ error: "Cannot amplify your own ping" });
    }

    // Create AMPLIFY message
    const amplifyIdBase = identity.id + ping.id + Date.now();
    const amplifyId = crypto.createHash("sha256").update(amplifyIdBase).digest("hex");
    const sig = signMessage(`amplify:${amplifyId}`, identity.privateKey);

    // Strip local fields for the network message
    // We need to send a valid PING object as 'originalPing'
    // 'ping' from store has 'likes', 'amplifiedBy', 'receivedAt' which are not allowed in PING validation
    const { likes, amplifiedBy, receivedAt, ...originalPingData } = ping;

    const amplifyMsg = {
        type: "AMPLIFY",
        id: amplifyId,
        originalPing: originalPingData,
        amplifier: identity.id,
        sig,
        ttl: 10 // Boosted TTL!
    };

    // Update local state
    pingStore.like(id, identity.id);

    // Broadcast to network
    swarm.broadcast(amplifyMsg);

    // Notify local SSE clients with the updated ping object
    // Frontend needs to handle updates (or we rely on reload, but better to push)
    const updatedPing = pingStore.get(id);
    
    // We convert Set to Array for JSON serialization (like in getAll)
    const serializablePing = {
        ...updatedPing,
        amplifiedBy: Array.from(updatedPing.amplifiedBy || [])
    };
    
    sseManager.broadcast(serializablePing);

    res.json({ success: true, likes: updatedPing.likes });
  });
};

module.exports = { setupRoutes };
