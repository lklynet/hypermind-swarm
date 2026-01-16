const crypto = require("crypto");
const { verifySignature, createPublicKey } = require("../../core/security");

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
        const { id, originalPing, amplifier, sig, ttl } = msg;

        if (this.bloomFilter.hasRelayed(id, "amplify")) {
            return;
        }

        const key = createPublicKey(amplifier);

        if (!verifySignature(`amplify:${id}`, sig, key)) {
            this.diagnostics.increment("invalidSig");
            return;
        }

        const pingIdBase =
            originalPing.author + originalPing.content + originalPing.timestamp;
        const computedPingId = crypto
            .createHash("sha256")
            .update(pingIdBase)
            .digest("hex");
        if (computedPingId !== originalPing.id) return;

        const pingKey = createPublicKey(originalPing.author);
        if (!verifySignature(`ping:${originalPing.id}`, originalPing.sig, pingKey))
            return;

        const isNewPing = this.pingStore.add(originalPing);
        if (isNewPing && this.pingCallback) {
            this.pingCallback(originalPing);
        }

        if (this.pingStore.like(originalPing.id, amplifier)) {
            if (amplifier === this.peerManager.myId && this.persistenceManager) {
                this.persistenceManager.append(msg).catch(() => { });
            }

            if (this.pingCallback) {
                const updatedPing = this.pingStore.get(originalPing.id);
                this.pingCallback(updatedPing);
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
