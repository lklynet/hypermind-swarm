const { VISUAL_LIMIT } = require("../../config/constants");

function setupSSERoutes(app, deps) {
    const { sseManager, peerManager, swarm, identity, diagnostics } = deps;

    app.get("/events", (req, res) => {
        console.log("New SSE connection request");

        const clientAdded = sseManager.addClient(res);
        if (!clientAdded) {
            res.status(503).json({ error: "Server at capacity" });
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no",
        });

        if (res.flushHeaders) res.flushHeaders();

        res.write("retry: 3000\n");
        res.write(": ok\n\n");

        const data = JSON.stringify({
            type: "INIT",
            count: peerManager.size,
            totalUnique: peerManager.totalUniquePeers,
            direct: swarm.getSwarm().connections.size,
            id: identity.id,
            username: identity.username,
            visualLimit: VISUAL_LIMIT,
            diagnostics: diagnostics.getStats(),
            peers: peerManager.getPeersWithIps(),
        });
        res.write(`data: ${data}\n\n`);

        if (res.flush) res.flush();

        req.on("close", () => {
            console.log("SSE connection closed");
            sseManager.removeClient(res);
        });
    });
}

module.exports = { setupSSERoutes };
