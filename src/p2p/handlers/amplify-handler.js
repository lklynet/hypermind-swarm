class AmplifyHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.pingStore = deps.pingStore;
        this.bloomFilter = deps.bloomFilter;
        this.relayCallback = deps.relayCallback;
        this.pingCallback = deps.pingCallback;
        this.persistenceManager = deps.persistenceManager;
        this.isMegaNode = deps.isMegaNode;
    }

    handle(msg, sourceSocket) {
        const { id, originalPing, amplifier, username, timestamp, ttl } = msg;

        if (this.bloomFilter.hasRelayed(id, "amplify")) {
            return;
        }

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

            if (this.isMegaNode && this.persistenceManager) {
                this.persistenceManager.persistAll(msg).catch(() => { });
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
