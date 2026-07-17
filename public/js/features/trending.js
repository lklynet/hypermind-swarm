import { DOM, state } from "../core/state.js";
import { fetchTrending as fetchTrendingApi } from "../core/api.js";
import { joinSwarm } from "./swarm.js";
import { escapeHtml, setSafeHtml } from "../utils/html.js";

export async function fetchTrending() {
    try {
        const topics = await fetchTrendingApi();
        renderTrending(topics);
    } catch (e) {
        console.error("Failed to fetch trending topics", e);
    }
}

function renderTrending(topics) {
    if (!DOM.trendingList) return;

    if (topics.length === 0) {
        DOM.trendingList.innerHTML = `<div style="padding: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">No trending topics yet.</div>`;
        return;
    }

    setSafeHtml(DOM.trendingList, topics
        .map(
            (t) => `
      <div class="trending-item" data-action="join-swarm" data-topic="${escapeHtml(t.name)}" style="cursor: pointer;">
        <span style="color: var(--primary-color);">#${escapeHtml(t.name)}</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${t.count} pings</span>
      </div>
    `
        )
        .join(""));
}
