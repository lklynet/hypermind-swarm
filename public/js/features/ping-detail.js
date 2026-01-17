import { DOM, state } from "../core/state.js";
import { fetchPing } from "../core/api.js";
import { escapeHtml } from "../utils/html.js";
import { getColorFromId } from "../utils/banner-generator.js";
import { renderMarkdown } from "../utils/markdown.js";
import { renderCommentSection } from "./comments.js";
import { updateUrl } from "../utils/url.js";
import { showFeed } from "./profile.js";

export async function showPing(id, push = true) {
    DOM.mainView.style.display = "none";
    DOM.profileView.style.display = "none";
    const pingView = document.getElementById("ping-view");
    const pingDetailContainer = document.getElementById("ping-detail-container");

    pingView.style.display = "block";

    if (push) updateUrl({ p: id, u: null, t: null });

    pingDetailContainer.innerHTML = "Loading...";

    try {
        const ping = await fetchPing(id);

        if (ping.username) {
            state.usernameCache.set(ping.author, ping.username);
        }

        const authorName = ping.username || "Anonymous";
        const avatarUrl = `/api/avatar/${ping.author}`;
        const isFollowing = state.following.includes(ping.author);

        let topicPill = "";
        if (ping.topic) {
            topicPill = `<span style="color: var(--primary-color); cursor: pointer;" onclick="event.stopPropagation(); window.joinSwarm('${escapeHtml(ping.topic)}')">#${escapeHtml(ping.topic)}</span>`;
        }

        const timestamp = new Date(ping.timestamp).toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        pingDetailContainer.innerHTML = `
            <div class="ping" id="detail-ping-${ping.id}">
                <div class="ping-content">
                    <div class="ping-header">
                        <div class="avatar ping-avatar" style="background-image: url('${avatarUrl}'); background-color: ${getColorFromId(ping.author)};" onclick="window.showProfile('${ping.author}')"></div>
                        <span class="ping-author" onclick="window.showProfile('${ping.author}')" style="cursor: pointer;">${escapeHtml(authorName)}${isFollowing ? ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.85rem;" title="Following"></i>' : ""}</span>
                        <span class="ping-handle">@${ping.author.slice(-8)}</span>
                    </div>
                    <div class="ping-text">${renderMarkdown(ping.content)}</div>
                    ${topicPill ? `<div style="margin-top: 0.5rem;">${topicPill}</div>` : ""}
                    <div class="ping-time">${timestamp}</div>
                    <div class="ping-actions">
                        <button class="action-btn amplify" onclick="window.amplifyPing('${ping.id}')">
                            <i class="fa-solid fa-bullhorn"></i> <span class="amplify-count">${ping.likes || 0}</span>
                        </button>
                        <button class="action-btn comment" onclick="window.toggleComment('${ping.id}')">
                            <i class="fa-regular fa-comment"></i> <span class="comment-count">${ping.comments ? ping.comments.length : 0}</span>
                        </button>
                        <button class="action-btn share" onclick="window.sharePing('${ping.id}')">
                            <i class="fa-solid fa-share"></i>
                        </button>
                    </div>
                    ${renderCommentSection(ping.id, ping.comments || [], true)}
                </div>
            </div>
        `;
    } catch (e) {
        pingDetailContainer.innerHTML = "<div class='failed-to-load-ping'>Failed to load ping.</div>";
        console.error(e);
    }
}

export function setupPingDetailListeners() {
    const backBtn = document.getElementById("ping-back-btn");
    if (backBtn) {
        backBtn.onclick = () => showFeed();
    }
}

window.showPing = showPing;
