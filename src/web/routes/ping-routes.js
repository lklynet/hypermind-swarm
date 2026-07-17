const { compactPingSnapshot } = require("../../state/pings");
const { signProtocolMessage } = require("../../p2p/validation/message-security");
const {
    CHAT_RATE_LIMIT,
    DEFAULT_MESSAGE_TTL,
    MAX_CONTENT_LENGTH,
    PING_RATE_LIMIT,
} = require("../../config/constants");
const { getSwarmId } = require("../../utils/swarm-utils");

const pingRateLimits = new Map();
const MESSAGE_ID_RE = /^[0-9a-f]{64}$/i;
const isValidTopic = (value) =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    !/[\u0000-\u001f\u007f]/.test(value);

function getClientKey(req) {
    return req.ip || req.socket.remoteAddress || "unknown";
}

function isPingRateLimited(req) {
    const now = Date.now();
    const clientKey = getClientKey(req);
    if (!pingRateLimits.has(clientKey) && pingRateLimits.size >= 5000) {
        pingRateLimits.delete(pingRateLimits.keys().next().value);
    }
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

    return false;
}

function setupPingRoutes(app, deps) {
    const { identity, pingStore, persistenceManager, swarm, sseManager } = deps;

    app.post("/api/ping", (req, res) => {
        if (isPingRateLimited(req)) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }

        const { content, topic } = req.body || {};
        if (
            !content ||
            typeof content !== "string" ||
            content.length > MAX_CONTENT_LENGTH
        ) {
            return res.status(400).json({ error: "Invalid content" });
        }

        if (topic !== undefined && typeof topic !== "string") {
            return res.status(400).json({ error: "Invalid topic" });
        }
        const normalizedTopic = (topic || "").trim().toLowerCase();
        if (normalizedTopic && !isValidTopic(normalizedTopic)) {
            return res.status(400).json({ error: "Invalid topic" });
        }

        let swarmId = 0;
        if (normalizedTopic) {
            swarmId = getSwarmId(normalizedTopic);
        }

        const timestamp = Date.now();
        const msg = signProtocolMessage({
            type: "PING",
            author: identity.id,
            username: identity.username,
            content,
            timestamp,
            hops: 0,
            ttl: DEFAULT_MESSAGE_TTL,
            swarmId,
            topic: normalizedTopic,
            nonce: identity.nonce,
        }, identity.privateKey);

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
        if (isPingRateLimited(req)) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }
        const { id } = req.body || {};
        if (!MESSAGE_ID_RE.test(id || "")) return res.status(400).json({ error: "Invalid ping ID" });

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

        const originalPingData = compactPingSnapshot(ping);
        const timestamp = Date.now();

        const amplifyMsg = signProtocolMessage({
            type: "AMPLIFY",
            originalPing: originalPingData,
            amplifier: identity.id,
            username: identity.username,
            timestamp,
            nonce: identity.nonce,
            ttl: DEFAULT_MESSAGE_TTL,
        }, identity.privateKey);

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

        const { pingId, content, topic } = req.body || {};
        if (
            !MESSAGE_ID_RE.test(pingId || "") ||
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
        if (requestedTopic && !isValidTopic(requestedTopic)) {
            return res.status(400).json({ error: "Invalid topic" });
        }
        const normalizedTopic = requestedTopic || originalPing.topic || "";
        const swarmId = normalizedTopic
            ? getSwarmId(normalizedTopic)
            : originalPing.swarmId || 0;

        const timestamp = Date.now();
        const quoteMsg = signProtocolMessage({
            type: "QUOTE",
            author: identity.id,
            username: identity.username,
            content,
            timestamp,
            hops: 0,
            ttl: DEFAULT_MESSAGE_TTL,
            swarmId,
            topic: normalizedTopic,
            quoteOf: pingId,
            quotedPing: compactPingSnapshot(originalPing),
            nonce: identity.nonce,
        }, identity.privateKey);

        const quoteId = quoteMsg.id;

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
        if (isPingRateLimited(req)) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }
        const { pingId, content } = req.body || {};
        if (
            !MESSAGE_ID_RE.test(pingId || "") ||
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
        const commentMsg = signProtocolMessage({
            type: "COMMENT",
            pingId,
            author: identity.id,
            username: identity.username,
            content,
            timestamp,
            ttl: 6,
            nonce: identity.nonce,
        }, identity.privateKey);

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
