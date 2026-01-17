const https = require("https");
const { GIPHY_API_KEY } = require("../../config/constants");

const API_ENDPOINT = "https://api.giphy.com/v1/gifs";

function setupGifRoutes(app) {
    app.get("/api/gif/search", (req, res) => {
        if (!GIPHY_API_KEY) {
            console.error("Error: GIPHY_API_KEY is undefined in config/constants");
            return res.status(500).json({ error: "Server Configuration Error: Missing GIPHY API Key" });
        }

        const query = req.query.q;
        const limit = req.query.limit || 20;
        const offset = req.query.offset || 0;

        if (!query) {
            return res.status(400).json({ error: "Query required" });
        }

        const params = new URLSearchParams({
            api_key: GIPHY_API_KEY,
            q: query,
            limit: limit,
            offset: offset,
            rating: "g",
            lang: "en"
        });

        const url = `${API_ENDPOINT}/search?${params.toString()}`;

        const request = https.get(url, (apiRes) => {
            let data = "";

            apiRes.on("data", (chunk) => {
                data += chunk;
            });

            apiRes.on("end", () => {
                let json;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    return res.status(500).json({ error: "JSON Parse Error", raw: data });
                }

                if (apiRes.statusCode !== 200) {
                    console.error("GIPHY API Error:", json);
                    return res.status(apiRes.statusCode).json({
                        error: "GIPHY Upstream Error",
                        status: apiRes.statusCode,
                        details: json
                    });
                }

                res.json(json);
            });
        });

        request.on("error", (e) => {
            console.error("Network Error:", e);
            res.status(500).json({ error: "Network Request Failed", message: e.message });
        });
    });
}

module.exports = { setupGifRoutes };