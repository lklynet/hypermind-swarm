const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { signMessage } = require("../core/security");
const { generateAvatar } = require("../utils/avatar");
const { generateScreenname } = require("../utils/name-generator");
const { CHAT_RATE_LIMIT, VISUAL_LIMIT } = require("../config/constants");
const { getSwarmId } = require("../utils/swarm-utils");

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
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no"
    });

    res.write("retry: 3000\n");
    res.write(": ok\n\n");

    sseManager.addClient(res);

    const data = JSON.stringify({
      type: "INIT",
      count: peerManager.size,
      totalUnique: peerManager.totalUniquePeers,
      direct: swarm.getSwarm().connections.size,
      id: identity.id,
      username: identity.username,
      visualLimit: VISUAL_LIMIT,
      diagnostics: diagnostics.getStats(),
      peers: peerManager.getPeersWithIps(),
    });
    res.write(`data: ${data}\n\n`);

    req.on("close", () => {
      sseManager.removeClient(res);
    });
  });

  app.get("/api/whoami", (req, res) => {
    res.json({ id: identity.id, username: identity.username });
  });

  app.get("/api/pings", (req, res) => {
    res.json(pingStore.getAll());
  });

  app.get("/api/trending", (req, res) => {
    const pings = pingStore.getAll();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const recentPings = pings.filter((p) => now - p.timestamp < ONE_DAY);
    const totalRecentPings = recentPings.length;

    if (totalRecentPings === 0) {
      return res.json([]);
    }

    const topicCounts = {};
    recentPings.forEach((p) => {
      if (p.topic) {
        const normalized = p.topic.trim().toLowerCase();
        topicCounts[normalized] = (topicCounts[normalized] || 0) + 1;
      }
    });

    const sorted = Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json(sorted);
  });

  app.get("/api/profile/:id", (req, res) => {
    const { id } = req.params;
    const pings = pingStore.getByAuthor(id);
    const latest = pings[0];
    const storedUsername = pingStore.getUsername(id);
    const profile = {
      id,
      username: storedUsername || (latest ? latest.username : generateScreenname(id)),
      pings,
    };
    res.json(profile);
  });

  app.post("/api/swarm/join", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const normalized = name.trim().toLowerCase();
    const id = swarm.joinSwarm(normalized);
    res.json({ success: true, id, name: normalized });
  });

  app.post("/api/swarm/leave", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const normalized = name.trim().toLowerCase();
    const id = swarm.leaveSwarm(normalized);
    res.json({ success: true, id, name: normalized });
  });

  app.post("/api/swarm/id", (req, res) => {
    const { name } = req.body;
    const normalized = (name || "").trim().toLowerCase();
    const id = getSwarmId(normalized);
    res.json({ id });
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

    const { content, topic } = req.body;
    if (!content || typeof content !== "string" || content.length > 280) {
      return res.status(400).json({ error: "Invalid content" });
    }

    const normalizedTopic = (topic || "").trim().toLowerCase();

    let swarmId = 0;
    if (normalizedTopic) {
      swarmId = getSwarmId(normalizedTopic);
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
      ttl: 10,
      swarmId,
      topic: normalizedTopic,
    };

    if (pingStore.add(msg)) {
      pingStore.like(msg.id, identity.id);

      swarm.broadcast(msg);

      const pingWithState = {
        ...msg,
        likes: 1,
        amplifiedBy: [identity.id],
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

    if (ping.amplifiedBy && ping.amplifiedBy.has(identity.id)) {
      return res.status(400).json({ error: "Already amplified" });
    }

    if (ping.author === identity.id) {
      return res.status(400).json({ error: "Cannot amplify your own ping" });
    }

    const amplifyIdBase = identity.id + ping.id + Date.now();
    const amplifyId = crypto
      .createHash("sha256")
      .update(amplifyIdBase)
      .digest("hex");
    const sig = signMessage(`amplify:${amplifyId}`, identity.privateKey);
    const { likes, amplifiedBy, receivedAt, ...originalPingData } = ping;

    const amplifyMsg = {
      type: "AMPLIFY",
      id: amplifyId,
      originalPing: originalPingData,
      amplifier: identity.id,
      sig,
      ttl: 10,
    };

    pingStore.like(id, identity.id);

    swarm.broadcast(amplifyMsg);

    const updatedPing = pingStore.get(id);

    const serializablePing = {
      ...updatedPing,
      amplifiedBy: Array.from(updatedPing.amplifiedBy || []),
    };

    sseManager.broadcast(serializablePing);

    res.json({ success: true, likes: updatedPing.likes });
  });

  app.post("/api/comment", (req, res) => {
    const { pingId, content } = req.body;
    if (!pingId || !content) {
      return res.status(400).json({ error: "Missing pingId or content" });
    }

    const ping = pingStore.get(pingId);
    if (!ping) {
      return res.status(404).json({ error: "Ping not found" });
    }

    const timestamp = Date.now();
    const idBase = identity.id + pingId + content + timestamp;
    const commentId = crypto.createHash("sha256").update(idBase).digest("hex");
    const sig = signMessage(`comment:${commentId}`, identity.privateKey);

    const commentMsg = {
      type: "COMMENT",
      id: commentId,
      pingId,
      author: identity.id,
      username: identity.username,
      content,
      timestamp,
      sig,
      ttl: 6,
    };

    if (pingStore.addComment(pingId, commentMsg)) {
      swarm.broadcast(commentMsg);

      const updatedPing = pingStore.get(pingId);
      const serializablePing = {
        ...updatedPing,
        amplifiedBy: Array.from(updatedPing.amplifiedBy || []),
      };
      sseManager.broadcast(serializablePing);

      res.json(commentMsg);
    } else {
      res.status(400).json({ error: "Failed to add comment" });
    }
  });
};

module.exports = { setupRoutes };
