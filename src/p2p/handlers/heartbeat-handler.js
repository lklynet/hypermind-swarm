const {
    verifyPoW,
} = require("../../core/security");
const { MAX_RELAY_HOPS } = require("../../config/constants");

class HeartbeatHandler {
    constructor(deps) {
        this.peerManager = deps.peerManager;
        this.diagnostics = deps.diagnostics;
        this.bloomFilter = deps.bloomFilter;
        this.relayCallback = deps.relayCallback;
        this.broadcastCallback = deps.broadcastCallback;
        this.systemMessageFn = deps.systemMessageFn;
        this.persistenceManager = deps.persistenceManager;
        this.requestCatchupFn = null;
    }

    setRequestCatchup(fn) {
        this.requestCatchupFn = fn;
    }

    handle(msg, sourceSocket) {
        this.diagnostics.increment("heartbeatsReceived");
        const { id, username, seq, hops, nonce, sig, swarmFilter, coreKey, megaNode } = msg;

        const stored = this.peerManager.getPeer(id);
        if (stored && seq <= stored.seq) {
            this.diagnostics.increment("duplicateSeq");
            return;
        }

        if (!verifyPoW(id, nonce)) {
            this.diagnostics.increment("invalidPoW");
            return;
        }

        if (!sig) return;

        try {
            if (!stored && !this.peerManager.canAcceptPeer(id)) return;

            if (hops === 0) {
                sourceSocket.peerId = id;
            }

            if (coreKey && this.persistenceManager) {
                this.persistenceManager.getPeerCore(coreKey, id).catch(() => { });
            }

            const ip = hops === 0 ? this.getIp(sourceSocket) : null;
            const wasNew = this.peerManager.addOrUpdatePeer(
                id,
                seq,
                ip,
                swarmFilter,
                msg.encKey,
                username,
                !!megaNode
            );

            if (wasNew) {
                this.diagnostics.increment("newPeersAdded");
                this.broadcastCallback();
                if (this.systemMessageFn && hops === 0) {
                    this.systemMessageFn({
                        type: "SYSTEM",
                        content: `Connection established with Node ...${id.slice(-8)}`,
                        timestamp: Date.now(),
                    });
                }

                if (megaNode && this.requestCatchupFn && hops === 0) {
                    this.requestCatchupFn(sourceSocket);
                }
            }

            if (hops < MAX_RELAY_HOPS && !this.bloomFilter.hasRelayed(id, seq)) {
                this.bloomFilter.markRelayed(id, seq);
                this.diagnostics.increment("heartbeatsRelayed");
                this.relayCallback({ ...msg, hops: hops + 1, megaNode: !!megaNode }, sourceSocket);
            }
        } catch (e) {
            return;
        }
    }

    getIp(sock) {
        if (sock.remoteAddress) return sock.remoteAddress;
        if (sock.rawStream && sock.rawStream.remoteHost)
            return sock.rawStream.remoteHost;
        if (sock.rawStream && sock.rawStream.remoteAddress)
            return sock.rawStream.remoteAddress;
        return null;
    }
}

module.exports = { HeartbeatHandler };
