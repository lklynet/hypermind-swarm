const { getSwarmId } = require("../../utils/swarm-utils");

function setupSwarmRoutes(app, deps) {
    const { swarm } = deps;

    app.post("/api/swarm/join", (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Missing name" });
        const normalized = name.trim().toLowerCase();
        const id = swarm.joinSwarm(normalized);
        res.json({ success: true, id, name: normalized });
    });

    app.post("/api/swarm/leave", (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Missing name" });
        const normalized = name.trim().toLowerCase();
        const id = swarm.leaveSwarm(normalized);
        res.json({ success: true, id, name: normalized });
    });

    app.post("/api/swarm/id", (req, res) => {
        const { name } = req.body;
        const normalized = (name || "").trim().toLowerCase();
        const id = getSwarmId(normalized);
        res.json({ id });
    });
}

module.exports = { setupSwarmRoutes };
