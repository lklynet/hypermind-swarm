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
  tweetStore
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

  app.get("/api/tweets", (req, res) => {
    res.json(tweetStore.getAll());
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

  let tweetHistory = [];

  app.post("/api/tweet", (req, res) => {
    const now = Date.now();
    tweetHistory = tweetHistory.filter((time) => now - time < CHAT_RATE_LIMIT);

    if (tweetHistory.length >= 5) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    tweetHistory.push(now);

    const { content } = req.body;
    if (!content || typeof content !== "string" || content.length > 280) {
      return res.status(400).json({ error: "Invalid content" });
    }

    const timestamp = Date.now();
    const idBase = identity.id + content + timestamp;
    const msgId = crypto.createHash("sha256").update(idBase).digest("hex");

    const sig = signMessage(`tweet:${msgId}`, identity.privateKey);

    const msg = {
      type: "TWEET",
      id: msgId,
      author: identity.id,
      username: identity.username,
      content,
      timestamp,
      sig,
      hops: 0,
    };

    // Store locally
    if (tweetStore.add(msg)) {
      // Broadcast to direct peers
      swarm.broadcast(msg);

      // Notify local SSE clients (so the user sees their own tweet)
      sseManager.broadcast(msg);

      res.json(msg);
    } else {
      res.status(400).json({ error: "Duplicate tweet" });
    }
  });

  app.post("/api/amplify", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing tweet ID" });

    const tweet = tweetStore.get(id);
    if (!tweet) {
      return res.status(404).json({ error: "Tweet not found" });
    }

    // Just rebroadcast the original tweet
    swarm.broadcast(tweet);

    res.json({ success: true });
  });
};

module.exports = { setupRoutes };
