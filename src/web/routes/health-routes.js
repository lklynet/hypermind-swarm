function setupHealthRoutes(app, deps) {
    const { identity, peerManager, swarm } = deps;
    app.get("/api/health", (req, res) => {
        res.json({
            status: "ok",
            id: identity.id,
            username: identity.username,
            peers: peerManager.size,
            connections: swarm.getSwarm().connections.size,
            timestamp: Date.now(),
        });
    });

    app.get("/api/stats", (req, res) => {
        res.json({
            id: identity.id,
            username: identity.username,
            peers: peerManager.size,
            connections: swarm.getSwarm().connections.size,
        });
    });
}

module.exports = { setupHealthRoutes };
