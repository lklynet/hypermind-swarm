const https = require("https");
const { TENOR_API_KEY } = require("../../config/constants");

/**
 * @fccview here, if you decide you want to contribute to the gif command
 * Feel free to add other provider endpoints here and adjust the logic
 * accordingly, my idea was to rotate a bunch of tenor proxies but i can't
 * seem to find any reliable ones anymore, the internet is going to shit.
 */
const API_ENDPOINTS = [
    "https://tenor.googleapis.com/v2",
];

function getApiEndpoint() {
    return API_ENDPOINTS[Math.floor(Math.random() * API_ENDPOINTS.length)];
}

function setupGifRoutes(app) {
    app.get("/api/gif/search", (req, res) => {
        const query = req.query.q;
        const limit = req.query.limit || 20;

        if (!query) {
            return res.status(400).json({ error: "Query parameter 'q' is required" });
        }

        const baseUrl = getApiEndpoint();
        const params = new URLSearchParams({
            q: query,
            limit: limit,
            media_filter: "gif",
            client_key: "hypermind_swarm"
        });

        if (TENOR_API_KEY && TENOR_API_KEY !== "undefined") {
            params.append("key", TENOR_API_KEY);
        }

        const url = `${baseUrl}/search?${params.toString()}`;

        https.get(url, (apiRes) => {
            let data = "";

            apiRes.on("data", (chunk) => {
                data += chunk;
            });

            apiRes.on("end", () => {
                try {
                    const safeUrl = url.replace(TENOR_API_KEY, "KEY");
                    console.log("Searching Tenor:", safeUrl);
                    console.log("Tenor response status:", apiRes.statusCode);
                    const json = JSON.parse(data);
                    if (json.error) {
                        console.error("Tenor API Error:", json.error);
                    }
                    res.json(json);
                } catch (e) {
                    console.error("Failed to parse JSON:", e, data);
                    res.status(500).json({ error: "Failed to parse Tenor response" });
                }
            });
        }).on("error", (e) => {
            console.error("Tenor API request failed:", e);
            res.status(500).json({ error: "Failed to fetch GIFs" });
        });
    });
}

module.exports = { setupGifRoutes };
