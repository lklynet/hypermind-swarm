require("dotenv").config();

const { generateIdentity } = require("./src/core/identity");
const { PeerManager } = require("./src/state/peers");
const { DiagnosticsManager } = require("./src/state/diagnostics");
const { PingStore } = require("./src/state/pings");
const { MessageHandler } = require("./src/p2p/messaging");
const { relayMessage } = require("./src/p2p/relay");
const { SwarmManager } = require("./src/p2p/swarm");
const PersistenceManager = require("./src/p2p/persistence");
const { SSEManager } = require("./src/web/sse");
const { createServer, startServer } = require("./src/web/server");
const { DIAGNOSTICS_INTERVAL } = require("./src/config/constants");

const main = async () => {
  const identity = generateIdentity();
  const storagePath = process.env.STORAGE_PATH || "./storage";
  const persistenceManager = new PersistenceManager(storagePath);

  const peerManager = new PeerManager(identity.id);
  const diagnostics = new DiagnosticsManager();
  const pingStore = new PingStore();
  const sseManager = new SSEManager();

  persistenceManager.onMessage = (msg) => {
    if (msg.type === "PING") {
      const isNew = pingStore.add(msg);
      if (isNew) {
        sseManager.broadcast(msg);
      }
    } else if (msg.type === "AMPLIFY") {
      pingStore.like(msg.originalPing.id, msg.amplifier);
      const updatedPing = pingStore.get(msg.originalPing.id);
      if (updatedPing) {
        sseManager.broadcast({
          ...updatedPing,
          amplifiedBy: Array.from(updatedPing.amplifiedBy || []),
        });
      }
    } else if (msg.type === "COMMENT") {
      pingStore.addComment(msg.pingId, msg);
      const updatedPing = pingStore.get(msg.pingId);
      if (updatedPing) {
        sseManager.broadcast({
          ...updatedPing,
          amplifiedBy: Array.from(updatedPing.amplifiedBy || []),
        });
      }
    }
  };

  await persistenceManager.init();

  peerManager.addOrUpdatePeer(identity.id, peerManager.getSeq());

  let swarmManager;
  let diagnosticsInterval;

  const broadcastUpdate = (reset = false) => {
    sseManager.broadcastUpdate({
      type: "UPDATE",
      count: peerManager.size,
      totalUnique: peerManager.totalUniquePeers,
      direct: swarmManager.getSwarm().connections.size,
      id: identity.id,
      diagnostics: reset
        ? diagnostics.getAndResetStats()
        : diagnostics.getStats(),
      peers: peerManager.getPeersWithIps(),
    });
  };

  const pingCallback = (msg) => {
    sseManager.broadcast(msg);
  };

  const systemMessageFn = (msg) => {
    sseManager.broadcast(msg);
  };

  const messageHandler = new MessageHandler(
    peerManager,
    diagnostics,
    pingStore,
    (msg, sourceSocket) =>
      relayMessage(
        msg,
        sourceSocket,
        swarmManager.getSwarm(),
        diagnostics,
        peerManager
      ),
    broadcastUpdate,
    pingCallback,
    systemMessageFn,
    persistenceManager
  );

  swarmManager = new SwarmManager(
    identity,
    peerManager,
    diagnostics,
    messageHandler,
    (msg, sourceSocket) =>
      relayMessage(
        msg,
        sourceSocket,
        swarmManager.getSwarm(),
        diagnostics,
        peerManager
      ),
    broadcastUpdate,
    systemMessageFn,
    persistenceManager
  );

  messageHandler.setGetSwarmFilter(() => swarmManager.swarmFilter);

  await swarmManager.start();

  broadcastUpdate();

  diagnosticsInterval = setInterval(() => {
    broadcastUpdate(true);
  }, DIAGNOSTICS_INTERVAL);

  const app = createServer(
    identity,
    peerManager,
    swarmManager,
    sseManager,
    diagnostics,
    pingStore,
    persistenceManager
  );
  startServer(app, identity);

  const handleShutdown = async () => {
    console.log("Shutting down gracefully...");

    if (diagnosticsInterval) {
      clearInterval(diagnosticsInterval);
    }

    messageHandler.cleanup();
    sseManager.cleanup();
    diagnostics.cleanup();
    peerManager.cleanup();
    pingStore.cleanup();
    await swarmManager.cleanup();
    await persistenceManager.cleanup();

    console.log("Cleanup complete");
    process.exit(0);
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
};

main().catch(console.error);
