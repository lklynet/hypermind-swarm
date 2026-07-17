const express = require("express");
const { HOST, PORT } = require("../config/constants");
const { setupRoutes } = require("./routes");

const createServer = (identity, peerManager, swarm, sseManager, diagnostics, pingStore, persistenceManager) => {
    const isLoopbackHost = HOST === "127.0.0.1" || HOST === "::1" || HOST === "localhost";
    if (!isLoopbackHost && !process.env.WEB_AUTH) {
        throw new Error("WEB_AUTH is required when HOST is not loopback");
    }
    if (!isLoopbackHost && !process.env.WEB_ALLOWED_HOSTS) {
        throw new Error("WEB_ALLOWED_HOSTS is required when HOST is not loopback");
    }
    const app = express();

    if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

    setupRoutes(app, identity, peerManager, swarm, sseManager, diagnostics, pingStore, persistenceManager);

    return app;
}

const startServer = (app, identity) => {
    app.listen(PORT, HOST, () => {
        console.log(`Hypermind Node running on ${HOST}:${PORT}`);
        console.log(`ID: ${identity.id}`);
    });
}

module.exports = { createServer, startServer };
