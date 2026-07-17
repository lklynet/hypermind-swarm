const Hyperswarm = require("hyperswarm");
const { signMessage } = require("../core/security");
const {
  TOPIC,
  HEARTBEAT_INTERVAL,
  MAX_CONNECTIONS,
  CONNECTION_ROTATION_INTERVAL,
  MAX_SOCKET_BUFFER_SIZE,
  MAX_MESSAGES_PER_SECOND,
  MEGA_NODE,
} = require("../config/constants");
const {
  getSwarmId,
  createSwarmFilter,
  updateSwarmFilter,
} = require("../utils/swarm-utils");

class SwarmManager {
  constructor(
    identity,
    peerManager,
    diagnostics,
    messageHandler,
    relayFn,
    broadcastFn,
    chatSystemFn,
    persistenceManager
  ) {
    this.identity = identity;
    this.peerManager = peerManager;
    this.diagnostics = diagnostics;
    this.messageHandler = messageHandler;
    this.relayFn = relayFn;
    this.broadcastFn = broadcastFn;
    this.chatSystemFn = chatSystemFn;
    this.persistenceManager = persistenceManager;

    this.swarm = new Hyperswarm();
    this.heartbeatInterval = null;
    this.rotationInterval = null;
    this.swarmFilter = createSwarmFilter();
    this.isMegaNode = MEGA_NODE;
  }

  async start() {
    this.swarm.on("connection", (socket) => this.handleConnection(socket));

    this.swarm.join(TOPIC);

    this.startHeartbeat();
    this.startRotation();
  }

  handleConnection(socket) {
    if (this.swarm.connections.size > MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }

    if (this.persistenceManager) {
      this.persistenceManager.replicate(socket);
    }

    socket.connectedAt = Date.now();

    const sig = signMessage(
      `seq:${this.peerManager.getSeq()}`,
      this.identity.privateKey
    );
    const hello = JSON.stringify({
      type: "HEARTBEAT",
      id: this.identity.id,
      username: this.identity.username,
      seq: this.peerManager.getSeq(),
      hops: 0,
      nonce: this.identity.nonce,
      sig,
      encKey: this.identity.encryptionPublicKey,
      coreKey: this.persistenceManager
        ? this.persistenceManager.getPrimaryPublicKey()
        : null,
      megaNode: this.isMegaNode,
    });
    socket.write(hello + "\n");
    this.diagnostics.increment("bytesSent", hello.length + 1);
    this.broadcastFn();

    socket.buffer = "";
    socket.messageTimestamps = [];

    socket.on("data", (data) => {
      this.diagnostics.increment("bytesReceived", data.length);
      socket.buffer += data.toString();

      if (socket.buffer.length > MAX_SOCKET_BUFFER_SIZE) {
        this.diagnostics.increment("bufferOverflows");
        socket.destroy();
        return;
      }

      const lines = socket.buffer.split("\n");
      socket.buffer = lines.pop();

      for (const msgStr of lines) {
        if (!msgStr.trim()) continue;
        try {
          const msg = JSON.parse(msgStr);

          const now = Date.now();
          socket.messageTimestamps = socket.messageTimestamps.filter(t => now - t < 1000);

          if (socket.messageTimestamps.length >= MAX_MESSAGES_PER_SECOND) {
            this.diagnostics.increment("rateLimitExceeded");
            socket.destroy();
            return;
          }

          socket.messageTimestamps.push(now);
          this.messageHandler.handleMessage(msg, socket);
        } catch (e) { }
      }
    });

    socket.on("close", () => {
      if (socket.peerId && this.peerManager.hasPeer(socket.peerId)) {
        this.peerManager.removePeer(socket.peerId);
      }
      delete socket.buffer;
      delete socket.peerId;
      delete socket.connectedAt;
      delete socket.messageTimestamps;
      this.broadcastFn();
    });

    socket.on("error", () => { });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const seq = this.peerManager.incrementSeq();
      this.peerManager.addOrUpdatePeer(this.identity.id, seq, null);

      const sig = signMessage(`seq:${seq}`, this.identity.privateKey);
      const heartbeat =
        JSON.stringify({
          type: "HEARTBEAT",
          id: this.identity.id,
          seq,
          hops: 0,
          nonce: this.identity.nonce,
          sig,
          coreKey: this.persistenceManager
            ? this.persistenceManager.getPrimaryPublicKey()
            : null,
          megaNode: this.isMegaNode,
        }) + "\n";

      for (const socket of this.swarm.connections) {
        socket.write(heartbeat);
        this.diagnostics.increment("bytesSent", heartbeat.length);
      }

      const removed = this.peerManager.cleanupStalePeers();
      if (removed > 0) {
        this.broadcastFn();
      }
    }, HEARTBEAT_INTERVAL);
  }

  startRotation() {
    this.rotationInterval = setInterval(() => {
      if (this.swarm.connections.size < MAX_CONNECTIONS / 2) return;

      let oldest = null;
      for (const socket of this.swarm.connections) {
        if (!oldest || socket.connectedAt < oldest.connectedAt) {
          oldest = socket;
        }
      }

      if (oldest) {
        if (this.chatSystemFn && oldest.peerId) {
          this.chatSystemFn({
            type: "SYSTEM",
            content: `Connection with Node ...${oldest.peerId.slice(
              -8
            )} severed (Rotation).`,
            timestamp: Date.now(),
          });
        }
        oldest.destroy();
      }
    }, CONNECTION_ROTATION_INTERVAL);
  }

  shutdown() {
    const sig = signMessage(
      `type:LEAVE:${this.identity.id}`,
      this.identity.privateKey
    );
    const goodbye =
      JSON.stringify({
        type: "LEAVE",
        id: this.identity.id,
        hops: 0,
        sig,
      }) + "\n";

    for (const socket of this.swarm.connections) {
      socket.write(goodbye);
      this.diagnostics.increment("bytesSent", goodbye.length);
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }

    this.swarmFilter = null;
  }

  cleanup() {
    this.shutdown();
    return this.swarm.destroy();
  }

  getSwarm() {
    return this.swarm;
  }

  broadcast(msg) {
    const msgStr = JSON.stringify(msg) + "\n";
    if (msg.type === "PING") {
      this.diagnostics.increment("pingsSent");
    }
    for (const socket of this.swarm.connections) {
      socket.write(msgStr);
      this.diagnostics.increment("bytesSent", msgStr.length);
    }
  }

  joinSwarm(name) {
    const id = getSwarmId(name);
    this.swarmFilter = updateSwarmFilter(this.swarmFilter, id, true);
    this.broadcastHeartbeat();
    return id;
  }

  leaveSwarm(name) {
    const id = getSwarmId(name);
    this.swarmFilter = updateSwarmFilter(this.swarmFilter, id, false);
    this.broadcastHeartbeat();
    return id;
  }

  broadcastHeartbeat() {
    const seq = this.peerManager.incrementSeq();
    this.peerManager.addOrUpdatePeer(
      this.identity.id,
      seq,
      null,
      this.swarmFilter,
      this.identity.encryptionPublicKey
    );

    const sig = signMessage(`seq:${seq}`, this.identity.privateKey);
    const heartbeat =
      JSON.stringify({
        type: "HEARTBEAT",
        id: this.identity.id,
        seq,
        hops: 0,
        nonce: this.identity.nonce,
        swarmFilter: this.swarmFilter,
        encKey: this.identity.encryptionPublicKey,
        sig,
        coreKey: this.persistenceManager
          ? this.persistenceManager.getPrimaryPublicKey()
          : null,
        megaNode: this.isMegaNode,
      }) + "\n";

    for (const socket of this.swarm.connections) {
      socket.write(heartbeat);
    }
  }
}

module.exports = { SwarmManager };
