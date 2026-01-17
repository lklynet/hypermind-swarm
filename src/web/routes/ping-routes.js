const crypto = require("crypto");
const { signMessage } = require("../../core/security");
const {
    CHAT_RATE_LIMIT,
    DEFAULT_MESSAGE_TTL,
    MAX_CONTENT_LENGTH,
    PING_RATE_LIMIT,
} = require("../../config/constants");
const { getSwarmId } = require("../../utils/swarm-utils");

let pingHistory = [];

function setupPingRoutes(app, deps) {
    const { identity, pingStore, persistenceManager, swarm, sseManager } = deps;

    app.post("/api/ping", (req, res) => {
        const now = Date.now();
        pingHistory = pingHistory.filter((time) => now - time < CHAT_RATE_LIMIT);

        if (pingHistory.length >= PING_RATE_LIMIT) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }

        pingHistory.push(now);

        const { content, topic } = req.body;
        if (
            !content ||
            typeof content !== "string" ||
            content.length > MAX_CONTENT_LENGTH
        ) {
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
            ttl: DEFAULT_MESSAGE_TTL,
            swarmId,
            topic: normalizedTopic,
        };

        if (pingStore.add(msg)) {
            pingStore.like(msg.id, identity.id);

            if (persistenceManager) {
                persistenceManager.append(msg).catch(() => { });
            }

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
            ttl: DEFAULT_MESSAGE_TTL,
        };

        pingStore.like(id, identity.id);

        if (persistenceManager) {
            persistenceManager.append(amplifyMsg).catch(() => { });
        }

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
            if (persistenceManager) {
                persistenceManager.append(commentMsg).catch(() => { });
            }

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
}

module.exports = { setupPingRoutes };
