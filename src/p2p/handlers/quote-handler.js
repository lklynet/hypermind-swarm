const crypto = require("crypto");
const { verifySignature, createPublicKey } = require("../../core/security");
const {
    RATE_LIMIT_WINDOW_MS,
    PING_RATE_LIMIT,
    DEFAULT_MESSAGE_TTL,
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

class QuoteHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.pingStore = deps.pingStore;
        this.rateLimits = deps.rateLimits;
        this.bloomFilter = deps.bloomFilter;
        this.relayCallback = deps.relayCallback;
        this.pingCallback = deps.pingCallback;
        this.persistenceManager = deps.persistenceManager;
        this.isMegaNode = deps.isMegaNode;
    }

    handle(msg, sourceSocket) {
        const { id, author, quoteOf, quotedPing } = msg;
        const ttl = typeof msg.ttl === "number" ? msg.ttl : DEFAULT_MESSAGE_TTL;

        if (this.bloomFilter.hasRelayed(id, "quote")) {
            return;
        }

        const now = Date.now();
        let rateData = this.rateLimits.get(author);
        if (!rateData || now - rateData.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateData = { count: 0, windowStart: now };
        }
        if (rateData.count >= PING_RATE_LIMIT) return;

        if (quotedPing.id !== quoteOf) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        if (!verifySignedPing(quotedPing) || !verifySignedPing(msg)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        if (!this.pingStore.has(quotedPing.id)) {
            this.pingStore.add(quotedPing);
        }

        const wasKnown = this.pingStore.has(id);
        const noteAdded = this.pingStore.addQuote(quoteOf, msg);
        const isNew = !wasKnown && this.pingStore.has(id);

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
                const quotePing = this.pingStore.get(id);
                this.pingCallback(this.pingStore.serializePing(quotePing));
            }
        }

        if (noteAdded && this.pingCallback) {
            const updatedOriginal = this.pingStore.get(quoteOf);
            if (updatedOriginal) {
                this.pingCallback(this.pingStore.serializePing(updatedOriginal));
            }
        }

        if ((isNew || noteAdded) && ttl > 0) {
            this.bloomFilter.markRelayed(id, "quote");
            this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
        }
    }
}

module.exports = { QuoteHandler };
