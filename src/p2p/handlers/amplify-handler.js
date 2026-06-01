const crypto = require("crypto");
const { verifySignature, createPublicKey } = require("../../core/security");

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

class AmplifyHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.pingStore = deps.pingStore;
        this.bloomFilter = deps.bloomFilter;
        this.relayCallback = deps.relayCallback;
        this.pingCallback = deps.pingCallback;
        this.persistenceManager = deps.persistenceManager;
    }

    handle(msg, sourceSocket) {
        const { id, originalPing, amplifier, username, timestamp, sig, ttl } = msg;

        if (this.bloomFilter.hasRelayed(id, "amplify")) {
            return;
        }

        const key = createPublicKey(amplifier);

        if (!verifySignature(`amplify:${id}`, sig, key)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        if (!verifySignedPing(originalPing)) return;

        const isNewPing = this.pingStore.add(originalPing);
        if (isNewPing && this.pingCallback) {
            this.pingCallback(this.pingStore.serializePing(this.pingStore.get(originalPing.id)));
        }

        if (this.pingStore.addAmplify(originalPing.id, amplifier, {
            username,
            timestamp,
        })) {
            if (amplifier === this.peerManager.myId && this.persistenceManager) {
                this.persistenceManager.append(msg).catch(() => { });
            }

            if (this.pingCallback) {
                const updatedPing = this.pingStore.get(originalPing.id);
                this.pingCallback(this.pingStore.serializePing(updatedPing));
            }
        }

        if (ttl > 0) {
            this.bloomFilter.markRelayed(id, "amplify");
            this.diagnostics.increment("amplifyRelayed");
            this.relayCallback({ ...msg, ttl: ttl - 1 }, sourceSocket);
        }
    }
}

module.exports = { AmplifyHandler };
