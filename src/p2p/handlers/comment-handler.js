const crypto = require("crypto");
const { verifySignature, createPublicKey } = require("../../core/security");
const {
    RATE_LIMIT_WINDOW_MS,
    COMMENT_RATE_LIMIT,
} = require("../../config/constants");

class CommentHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.pingStore = deps.pingStore;
        this.rateLimits = deps.rateLimits;
        this.relayCallback = deps.relayCallback;
        this.pingCallback = deps.pingCallback;
        this.persistenceManager = deps.persistenceManager;
    }

    handle(msg, sourceSocket) {
        const { id, pingId, author, content, timestamp, sig, ttl } = msg;

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

        const isNew = this.pingStore.addComment(pingId, msg);
        if (isNew) {
            rateData.count++;
            this.rateLimits.set(author, rateData);

            if (author === this.peerManager.myId && this.persistenceManager) {
                this.persistenceManager.append(msg).catch(() => { });
            }

            if (this.pingCallback) {
                const updatedPing = this.pingStore.get(pingId);
                if (updatedPing) {
                    this.pingCallback(updatedPing);
                }
            }
        }

        if (isNew && ttl > 0) {
            this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
        }
    }
}

module.exports = { CommentHandler };
