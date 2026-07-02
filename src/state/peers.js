const { MAX_PEERS, PEER_TIMEOUT } = require("../config/constants");
const { LRUCache } = require("./lru");
const { HyperLogLog } = require("./hyperloglog");

class PeerManager {
  constructor(myId) {
    this.myId = myId;
    this.seenPeers = new LRUCache(MAX_PEERS);
    this.uniquePeersHLL = new HyperLogLog(10);
    this.mySeq = 0;
  }

  addOrUpdatePeer(
    id,
    seq,
    ip = null,
    swarmFilter = null,
    encKey = null,
    username = null,
    megaNode = null
  ) {
    const stored = this.seenPeers.get(id);
    const wasNew = !stored;

    this.uniquePeersHLL.add(id);

    this.seenPeers.set(id, {
      seq,
      lastSeen: Date.now(),
      ip: ip || (stored ? stored.ip : null),
      swarmFilter: swarmFilter || (stored ? stored.swarmFilter : null),
      encKey: encKey || (stored ? stored.encKey : null),
      username: username || (stored ? stored.username : null),
      megaNode: megaNode !== null ? megaNode : (stored ? stored.megaNode : false),
    });

    return wasNew;
  }

  canAcceptPeer(id) {
    if (this.seenPeers.has(id)) return true;
    return this.seenPeers.size < MAX_PEERS;
  }

  getPeer(id) {
    return this.seenPeers.get(id);
  }

  removePeer(id) {
    return this.seenPeers.delete(id);
  }

  hasPeer(id) {
    return this.seenPeers.has(id);
  }

  isMegaNode(peerId) {
    const peer = this.seenPeers.get(peerId);
    return !!(peer && peer.megaNode);
  }

  cleanupStalePeers() {
    const now = Date.now();
    let removed = 0;

    for (const [id, data] of this.seenPeers.entries()) {
      if (now - data.lastSeen > PEER_TIMEOUT) {
        this.seenPeers.delete(id);
        removed++;
      } else {
        break;
      }
    }

    return removed;
  }

  get size() {
    return this.seenPeers.size;
  }

  get totalUniquePeers() {
    return this.uniquePeersHLL.count();
  }

  incrementSeq() {
    return ++this.mySeq;
  }

  getSeq() {
    return this.mySeq;
  }

  getPeersWithIps() {
    const peers = [];
    for (const [id, data] of this.seenPeers.entries()) {
      peers.push({
        id,
        ip: data.ip,
        username: data.username,
        isLocal: id === this.myId,
      });
    }
    return peers;
  }

  cleanup() {
    this.seenPeers.clear();
    this.mySeq = 0;
  }
}

module.exports = { PeerManager };
