const { MAX_RELAY_HOPS } = require("../../config/constants");

class LeaveHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.bloomFilter = deps.bloomFilter;
        this.relayCallback = deps.relayCallback;
        this.broadcastCallback = deps.broadcastCallback;
        this.systemMessageFn = deps.systemMessageFn;
    }

    handle(msg, sourceSocket) {
        this.diagnostics.increment("leaveMessages");
        const { id, hops } = msg;

        if (!this.peerManager.hasPeer(id)) return;

        if (this.peerManager.hasPeer(id)) {
            this.peerManager.removePeer(id);
            this.broadcastCallback();

            if (this.systemMessageFn && hops === 0) {
                this.systemMessageFn({
                    type: "SYSTEM",
                    content: `Node ...${id.slice(-8)} disconnected.`,
                    timestamp: Date.now(),
                });
            }

            if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, "leave")) {
                this.bloomFilter.markRelayed(id, "leave");
                this.relayCallback({ ...msg, hops: hops + 1 }, sourceSocket);
            }
        }
    }
}

module.exports = { LeaveHandler };
