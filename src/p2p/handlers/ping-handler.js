const crypto = require("crypto");
const { verifySignature, createPublicKey } = require("../../core/security");
const {
    RATE_LIMIT_WINDOW_MS,
    PING_RATE_LIMIT,
    DEFAULT_MESSAGE_TTL,
} = require("../../config/constants");

class PingHandler {
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
        const { author, id, sig, timestamp } = msg;
        const ttl = typeof msg.ttl === "number" ? msg.ttl : DEFAULT_MESSAGE_TTL;

        const now = Date.now();
        let rateData = this.rateLimits.get(author);

        if (!rateData || now - rateData.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateData = { count: 0, windowStart: now };
        }

        if (rateData.count >= PING_RATE_LIMIT) {
            return;
        }

        const idBase = author + msg.content + msg.timestamp;
        const computedId = crypto.createHash("sha256").update(idBase).digest("hex");

        if (computedId !== id) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        const key = createPublicKey(author);
        if (!verifySignature(`ping:${id}`, sig, key)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        const isNew = this.pingStore.add(msg);
        if (isNew) {
            rateData.count++;
            this.rateLimits.set(author, rateData);

            if (author === this.peerManager.myId && this.persistenceManager) {
                this.persistenceManager.append(msg).catch(() => { });
            }

            if (this.pingCallback) {
                this.pingCallback(msg);
            }
        }

        if (isNew && ttl > 0) {
            this.diagnostics.increment("pingsRelayed");
            this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
        }
    }
}

module.exports = { PingHandler };
