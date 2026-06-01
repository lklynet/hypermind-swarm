const { generateScreenname } = require("../../utils/name-generator");

function setupProfileRoutes(app, deps) {
    const { identity, pingStore } = deps;

    app.get("/api/whoami", (req, res) => {
        res.json({ id: identity.id, username: identity.username });
    });

    app.get("/api/pings", (req, res) => {
        res.json(pingStore.getAll());
    });

    app.get("/api/trending", (req, res) => {
        const pings = pingStore.getAll();
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        const recentPings = pings.filter((p) => now - p.timestamp < ONE_DAY);
        const totalRecentPings = recentPings.length;

        if (totalRecentPings === 0) {
            return res.json([]);
        }

        const topicCounts = {};
        recentPings.forEach((p) => {
            if (p.topic) {
                const normalized = p.topic.trim().toLowerCase();
                topicCounts[normalized] = (topicCounts[normalized] || 0) + 1;
            }
        });

        const sorted = Object.entries(topicCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json(sorted);
    });

    app.get("/api/profile/:id", (req, res) => {
        const { id } = req.params;
        const pings = pingStore.getByAuthor(id);
        const latest = pings[0];
        const storedUsername = pingStore.getUsername(id);
        const profile = {
            id,
            username:
                storedUsername || (latest ? latest.username : generateScreenname(id)),
            pings,
        };
        res.json(profile);
    });

    app.get("/api/ping/:id", (req, res) => {
        const { id } = req.params;
        const ping = pingStore.get(id);
        if (!ping) {
            return res.status(404).json({ error: "Ping not found" });
        }
        res.json(pingStore.serializePing(ping));
    });

    app.get("/api/catchup", (req, res) => {
        const since = parseInt(req.query.since) || 0;
        const pings = pingStore.getPingsSince(since);
        res.json({
            pings,
            serverTime: Date.now(),
        });
    });
}

module.exports = { setupProfileRoutes };
