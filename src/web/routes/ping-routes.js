const crypto = require("crypto");
const { signMessage } = require("../../core/security");
const { compactPingSnapshot } = require("../../state/pings");
const {
    CHAT_RATE_LIMIT,
    DEFAULT_MESSAGE_TTL,
    MAX_CONTENT_LENGTH,
    PING_RATE_LIMIT,
} = require("../../config/constants");
const { getSwarmId } = require("../../utils/swarm-utils");

const pingRateLimits = new Map();

function getClientKey(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress || "unknown";
}

function isPingRateLimited(req) {
    const now = Date.now();
    const clientKey = getClientKey(req);
    let rateData = pingRateLimits.get(clientKey);

    if (!rateData || now - rateData.windowStart >= CHAT_RATE_LIMIT) {
        rateData = { count: 0, windowStart: now };
    }

    if (rateData.count >= PING_RATE_LIMIT) {
        pingRateLimits.set(clientKey, rateData);
        return true;
    }

    rateData.count++;
    pingRateLimits.set(clientKey, rateData);

    if (pingRateLimits.size > 5000) {
        for (const [key, data] of pingRateLimits.entries()) {
            if (now - data.windowStart >= CHAT_RATE_LIMIT) {
                pingRateLimits.delete(key);
            }
        }
    }

    return false;
}

function setupPingRoutes(app, deps) {
    const { identity, pingStore, persistenceManager, swarm, sseManager } = deps;

    app.post("/api/ping", (req, res) => {
        if (isPingRateLimited(req)) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }

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
            if (persistenceManager) {
                persistenceManager.append(msg).catch(() => { });
            }

            swarm.broadcast(msg);

            sseManager.broadcast(pingStore.serializePing(pingStore.get(msg.id)));

            res.json(pingStore.serializePing(pingStore.get(msg.id)));
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
        const originalPingData = compactPingSnapshot(ping);
        const timestamp = Date.now();

        const amplifyMsg = {
            type: "AMPLIFY",
            id: amplifyId,
            originalPing: originalPingData,
            amplifier: identity.id,
            username: identity.username,
            timestamp,
            sig,
            ttl: DEFAULT_MESSAGE_TTL,
        };

        pingStore.addAmplify(id, identity.id, {
            username: identity.username,
            timestamp,
        });

        if (persistenceManager) {
            persistenceManager.append(amplifyMsg).catch(() => { });
        }

        swarm.broadcast(amplifyMsg);

        const updatedPing = pingStore.get(id);

        const serializablePing = pingStore.serializePing(updatedPing);

        sseManager.broadcast(serializablePing);

        res.json({
            success: true,
            likes: updatedPing.likes,
            noteCounts: updatedPing.noteCounts,
        });
    });

    app.post("/api/quote", (req, res) => {
        if (isPingRateLimited(req)) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }

        const { pingId, content, topic } = req.body;
        if (
            !pingId ||
            !content ||
            typeof content !== "string" ||
            content.length > MAX_CONTENT_LENGTH
        ) {
            return res.status(400).json({ error: "Invalid pingId or content" });
        }

        const originalPing = pingStore.get(pingId);
        if (!originalPing) {
            return res.status(404).json({ error: "Ping not found" });
        }

        const requestedTopic = typeof topic === "string"
            ? topic.trim().toLowerCase()
            : "";
        const normalizedTopic = requestedTopic || originalPing.topic || "";
        const swarmId = normalizedTopic
            ? getSwarmId(normalizedTopic)
            : originalPing.swarmId || 0;

        const timestamp = Date.now();
        const idBase = identity.id + pingId + content + timestamp;
        const quoteId = crypto.createHash("sha256").update(idBase).digest("hex");
        const sig = signMessage(`quote:${quoteId}`, identity.privateKey);

        const quoteMsg = {
            type: "QUOTE",
            id: quoteId,
            author: identity.id,
            username: identity.username,
            content,
            timestamp,
            sig,
            hops: 0,
            ttl: DEFAULT_MESSAGE_TTL,
            swarmId,
            topic: normalizedTopic,
            quoteOf: pingId,
            quotedPing: compactPingSnapshot(originalPing),
        };

        const wasKnown = pingStore.has(quoteId);
        const noteAdded = pingStore.addQuote(pingId, quoteMsg);
        if (wasKnown || !pingStore.has(quoteId)) {
            return res.status(400).json({ error: "Duplicate quote" });
        }

        if (persistenceManager) {
            persistenceManager.append(quoteMsg).catch(() => { });
        }

        swarm.broadcast(quoteMsg);

        const serializableQuote = pingStore.serializePing(pingStore.get(quoteId));
        sseManager.broadcast(serializableQuote);

        if (noteAdded) {
            sseManager.broadcast(pingStore.serializePing(pingStore.get(pingId)));
        }

        res.json(serializableQuote);
    });

    app.post("/api/comment", (req, res) => {
        const { pingId, content } = req.body;
        if (
            !pingId ||
            !content ||
            typeof content !== "string" ||
            content.length > MAX_CONTENT_LENGTH
        ) {
            return res.status(400).json({ error: "Invalid pingId or content" });
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
            originalPing: compactPingSnapshot(ping),
        };

        if (pingStore.addComment(pingId, commentMsg)) {
            if (persistenceManager) {
                persistenceManager.append(commentMsg).catch(() => { });
            }

            swarm.broadcast(commentMsg);

            const updatedPing = pingStore.get(pingId);
            sseManager.broadcast(pingStore.serializePing(updatedPing));

            res.json(commentMsg);
        } else {
            res.status(400).json({ error: "Failed to add comment" });
        }
    });
}

module.exports = { setupPingRoutes };
