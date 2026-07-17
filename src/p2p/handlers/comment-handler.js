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
        this.isMegaNode = deps.isMegaNode;
    }

    handle(msg, sourceSocket) {
        const { id, pingId, author, ttl } = msg;

        const now = Date.now();
        let rateData = this.rateLimits.get(author);
        if (!rateData || now - rateData.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateData = { count: 0, windowStart: now };
        }
        if (rateData.count >= COMMENT_RATE_LIMIT) return;

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
