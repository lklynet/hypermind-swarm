const { hasSwarmSubscription } = require("../utils/swarm-utils");

const relayMessage = (msg, sourceSocket, swarm, diagnostics, peerManager) => {
  const data = JSON.stringify(msg) + "\n";
  const swarmId = msg.swarmId || 0;

  // Gossip Subsampling:
  // Instead of flooding everyone (which causes massive bandwidth usage with 50 connections),
  // we relay to a random subset of peers (e.g., 6).
  // This maintains "Epidemic" reach (O(log N)) while capping bandwidth.

  const TARGET_GOSSIP_COUNT = 6;
  const allSockets = Array.from(swarm.connections);
  
  const eligible = allSockets.filter((s) => {
    if (s === sourceSocket) return false;

    // Filter by Swarm Subscription
    // If it's the global swarm (0), we send to everyone (including legacy nodes without filters)
    if (swarmId === 0) return true;

    // For specific swarms, we need to check the peer's filter
    if (peerManager && s.peerId) {
        const peer = peerManager.getPeer(s.peerId);
        // If peer has a filter, check it
        if (peer && peer.swarmFilter) {
            return hasSwarmSubscription(peer.swarmFilter, swarmId);
        }
        // If peer has NO filter (legacy node), they only support Global
        return false;
    }

    // If we don't know the peer yet, only send Global
    return false;
  });

  let targets = eligible;

  if (eligible.length > TARGET_GOSSIP_COUNT) {
    // Fisher-Yates shuffle (partial) to pick random peers
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    targets = eligible.slice(0, TARGET_GOSSIP_COUNT);
  }

  if (diagnostics) {
    diagnostics.increment("bytesRelayed", data.length * targets.length);
  }

  for (const socket of targets) {
    socket.write(data);
  }
};

module.exports = { relayMessage };
