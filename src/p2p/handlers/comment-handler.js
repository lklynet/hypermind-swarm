const crypto = require("crypto");
const { verifySignature, createPublicKey } = require("../../core/security");
const {
    RATE_LIMIT_WINDOW_MS,
    COMMENT_RATE_LIMIT,
} = require("../../config/constants");

function computePingId(ping) {
    if (!ping) return "";
    if (ping.type === "QUOTE") {
        return crypto
            .createHash("sha256")
            .update(ping.author + ping.quoteOf + ping.content + ping.timestamp)
            .digest("hex");
    }

    return crypto
        .createHash("sha256")
        .update(ping.author + ping.content + ping.timestamp)
        .digest("hex");
}

function verifySignedPing(ping) {
    if (!ping || !ping.author || !ping.sig) return false;
    if (computePingId(ping) !== ping.id) return false;

    const key = createPublicKey(ping.author);
    const prefix = ping.type === "QUOTE" ? "quote" : "ping";
    return verifySignature(`${prefix}:${ping.id}`, ping.sig, key);
}

class CommentHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.pingStore = deps.pingStore;
        this.rateLimits = deps.rateLimits;
        this.relayCallback = deps.relayCallback;
        this.pingCallback = deps.pingCallback;
        this.persistenceManager = deps.persistenceManager;
        this.isMegaNode = deps.isMegaNode;
    }

    handle(msg, sourceSocket) {
        const { id, pingId, author, content, timestamp, sig, ttl, originalPing } = msg;

        const now = Date.now();
        let rateData = this.rateLimits.get(author);
        if (!rateData || now - rateData.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateData = { count: 0, windowStart: now };
        }
        if (rateData.count >= COMMENT_RATE_LIMIT) return;

        const idBase = author + pingId + content + timestamp;
        const computedId = crypto.createHash("sha256").update(idBase).digest("hex");
        if (computedId !== id) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        const key = createPublicKey(author);
        if (!verifySignature(`comment:${id}`, sig, key)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        if (originalPing && !verifySignedPing(originalPing)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        const isNew = this.pingStore.addComment(pingId, msg);
        if (isNew) {
            rateData.count++;
            this.rateLimits.set(author, rateData);

            if (author === this.peerManager.myId && this.persistenceManager) {
                this.persistenceManager.append(msg).catch(() => { });
            }

            if (this.isMegaNode && this.persistenceManager) {
                this.persistenceManager.persistAll(msg).catch(() => { });
            }

            if (this.pingCallback) {
                const updatedPing = this.pingStore.get(pingId);
                if (updatedPing) {
                    this.pingCallback(this.pingStore.serializePing(updatedPing));
                }
            }
        }

        if (isNew && ttl > 0) {
            this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
        }
    }
}

module.exports = { CommentHandler };
