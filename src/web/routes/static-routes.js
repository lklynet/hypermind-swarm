const fs = require("fs");
const path = require("path");
const { generateAvatar } = require("../../utils/avatar");
const { VISUAL_LIMIT } = require("../../config/constants");

const HTML_TEMPLATE = fs.readFileSync(
    path.join(__dirname, "../../../public/index.html"),
    "utf-8"
);

function setupStaticRoutes(app, deps) {
    const { identity, peerManager, swarm } = deps;

    app.get("/", (req, res) => {
        const count = peerManager.size;
        const directPeers = swarm.getSwarm().connections.size;

        const html = HTML_TEMPLATE.replace(/\{\{COUNT\}\}/g, count)
            .replace(
                /\{\{ID\}\}/g,
                identity.username || "..." + identity.id.slice(-8)
            )
            .replace(/\{\{DIRECT\}\}/g, directPeers)
            .replace(/\{\{VISUAL_LIMIT\}\}/g, VISUAL_LIMIT);

        res.send(html);
    });

    app.get("/api/avatar/:id", async (req, res) => {
        const { id } = req.params;
        try {
            const svg = await generateAvatar(id);
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=31536000");
            res.send(svg);
        } catch (e) {
            res.status(500).send("Error generating avatar");
        }
    });
}

module.exports = { setupStaticRoutes };
