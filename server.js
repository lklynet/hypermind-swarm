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
        sseManager.broadcast(pingStore.serializePing(pingStore.get(msg.id)));
      }
    } else if (msg.type === "AMPLIFY") {
      if (msg.originalPing && !pingStore.has(msg.originalPing.id)) {
        pingStore.add(msg.originalPing);
      }
      pingStore.addAmplify(msg.originalPing.id, msg.amplifier, {
        username: msg.username,
        timestamp: msg.timestamp,
      });
      const updatedPing = pingStore.get(msg.originalPing.id);
      if (updatedPing) {
        sseManager.broadcast(pingStore.serializePing(updatedPing));
      }
    } else if (msg.type === "COMMENT") {
      pingStore.addComment(msg.pingId, msg);
      const updatedPing = pingStore.get(msg.pingId);
      if (updatedPing) {
        sseManager.broadcast(pingStore.serializePing(updatedPing));
      }
    } else if (msg.type === "QUOTE") {
      if (msg.quotedPing && !pingStore.has(msg.quotedPing.id)) {
        pingStore.add(msg.quotedPing);
      }

      const wasKnown = pingStore.has(msg.id);
      const noteAdded = pingStore.addQuote(msg.quoteOf, msg);

      if (!wasKnown && pingStore.has(msg.id)) {
        sseManager.broadcast(pingStore.serializePing(pingStore.get(msg.id)));
      }

      if (noteAdded) {
        const updatedOriginal = pingStore.get(msg.quoteOf);
        if (updatedOriginal) {
          sseManager.broadcast(pingStore.serializePing(updatedOriginal));
        }
      }
    }
  };

  await persistenceManager.init();

  peerManager.addOrUpdatePeer(identity.id, peerManager.getSeq());

  let swarmManager;
  let diagnosticsInterval;
  let isShuttingDown = false;

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
    if (msg && msg.id && pingStore.has(msg.id)) {
      sseManager.broadcast(pingStore.serializePing(pingStore.get(msg.id)));
      return;
    }
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
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("Shutting down gracefully...");

    try {
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
    } catch (err) {
      console.error("Shutdown failed:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
};

main().catch(console.error);
