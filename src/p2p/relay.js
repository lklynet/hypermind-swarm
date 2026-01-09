const { hasSwarmSubscription } = require("../utils/swarm-utils");

const relayMessage = (msg, sourceSocket, swarm, diagnostics, peerManager) => {
  const data = JSON.stringify(msg) + "\n";
  const swarmId = msg.swarmId || 0;

  const TARGET_GOSSIP_COUNT = 10;
  const allSockets = Array.from(swarm.connections);
  
  const eligible = allSockets.filter((s) => {
    if (s === sourceSocket) return false;

    if (swarmId === 0) return true;

    if (peerManager && s.peerId) {
        const peer = peerManager.getPeer(s.peerId);

        if (peer && peer.swarmFilter) {
            return hasSwarmSubscription(peer.swarmFilter, swarmId);
        }
        return false;
    }

    return false;
  });

  let targets = eligible;

  if (eligible.length > TARGET_GOSSIP_COUNT) {

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
