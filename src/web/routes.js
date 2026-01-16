const express = require("express");
const path = require("path");
const { setupSSERoutes } = require("./routes/sse-routes");
const { setupPingRoutes } = require("./routes/ping-routes");
const { setupProfileRoutes } = require("./routes/profile-routes");
const { setupSwarmRoutes } = require("./routes/swarm-routes");
const { setupStaticRoutes } = require("./routes/static-routes");
const { setupGifRoutes } = require("./routes/gif-routes");

const setupRoutes = (
  app,
  identity,
  peerManager,
  swarm,
  sseManager,
  diagnostics,
  pingStore,
  persistenceManager
) => {
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../../public")));

  const deps = {
    identity,
    peerManager,
    swarm,
    sseManager,
    diagnostics,
    pingStore,
    persistenceManager,
  };

  setupStaticRoutes(app, deps);
  setupSSERoutes(app, deps);
  setupProfileRoutes(app, deps);
  setupSwarmRoutes(app, deps);
  setupPingRoutes(app, deps);
  setupGifRoutes(app);
};

module.exports = { setupRoutes };
