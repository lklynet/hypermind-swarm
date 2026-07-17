import { DOM, state } from "../core/state.js";
import { fetchPing } from "../core/api.js";
import { escapeHtml, setSafeHtml } from "../utils/html.js";
import { getAvatarBgVar } from "../utils/banner-generator.js";
import { renderMarkdown } from "../utils/markdown.js";
import { renderCommentSection } from "./comments.js";
import { renderNotesSection } from "./notes.js";
import { renderQuotedPingCard } from "./quotes.js";
import { updateUrl } from "../utils/url.js";
import { showFeed } from "./profile.js";

function renderDetailTabs(ping) {
    const replyCount = ping.comments ? ping.comments.length : 0;
    const activityCount = ping.noteCounts ? ping.noteCounts.total || 0 : 0;

    return `
        <div class="ping-detail-tabs" data-ping-id="${ping.id}">
            <div class="ping-detail-tab-list">
                <button class="ping-detail-tab active" data-panel="replies" data-action="detail-panel" data-ping-id="${ping.id}">
                    Replies <span>${replyCount}</span>
                </button>
                <button class="ping-detail-tab" data-panel="activity" data-action="detail-panel" data-ping-id="${ping.id}">
                    Activity <span>${activityCount}</span>
                </button>
            </div>
            <div class="ping-detail-panel active" data-panel="replies">
                ${renderCommentSection(ping.id, ping.comments || [], true)}
            </div>
            <div class="ping-detail-panel" data-panel="activity">
                ${renderNotesSection(ping) || `<div class="activity-empty">No activity yet.</div>`}
            </div>
        </div>
    `;
}

export async function showPing(id, push = true, initialPanel = "replies") {
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
            topicPill = `<span class="ping-topic" data-action="join-swarm" data-topic="${escapeHtml(ping.topic)}">#${escapeHtml(ping.topic)}</span>`;
        }

        const timestamp = new Date(ping.timestamp).toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const alreadyAmplified = ping.amplifiedBy?.includes(state.myId) || ping.author === state.myId;

        setSafeHtml(pingDetailContainer, `
            <div class="ping" id="detail-ping-${ping.id}">
                <div class="ping-content">
                    <div class="ping-header">
                        <div class="avatar ping-avatar" style="background-image: url('${avatarUrl}'); background-color: ${getAvatarBgVar(ping.author)};" data-action="show-profile" data-user-id="${ping.author}"></div>
                        <span class="ping-author" data-action="show-profile" data-user-id="${ping.author}" style="cursor: pointer;">${escapeHtml(authorName)}${isFollowing ? ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.85rem;" title="Following"></i>' : ""}</span>
                        <span class="ping-handle" data-action="show-ping" data-ping-id="${ping.id}">@${ping.author.slice(-8)}</span>
                    </div>
                    <div class="ping-text">${renderMarkdown(ping.content)}</div>
                    ${renderQuotedPingCard(ping)}
                    ${topicPill ? `<div style="margin-top: 0.5rem;">${topicPill}</div>` : ""}
                    <div class="ping-time">${timestamp}</div>
                    <div class="ping-actions">
                        <button class="action-btn amplify${alreadyAmplified ? ' amplified' : ''}" data-action="amplify-ping" data-ping-id="${ping.id}">
                            <i class="fa-solid fa-bullhorn"></i> <span class="amplify-count">${ping.likes || 0}</span>
                        </button>
                        <button class="action-btn comment" data-action="toggle-comment" data-ping-id="${ping.id}">
                            <i class="fa-regular fa-comment"></i> <span class="comment-count">${ping.comments ? ping.comments.length : 0}</span>
                        </button>
                        <button class="action-btn quote" data-action="quote-ping" data-ping-id="${ping.id}">
                            <i class="fa-solid fa-quote-left"></i> <span class="quote-count">${ping.noteCounts ? ping.noteCounts.quotes || 0 : 0}</span>
                        </button>
                        <button class="action-btn share" data-action="share-ping" data-ping-id="${ping.id}">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    </div>
                    ${renderDetailTabs(ping)}
                </div>
            </div>
        `);

        if (initialPanel !== "replies") {
            switchPingDetailPanel(ping.id, initialPanel);
        }
    } catch (e) {
        pingDetailContainer.innerHTML = "<div class='failed-to-load-ping'>Failed to load ping.</div>";
        console.error(e);
    }
}

export async function showPingActivity(id, push = true) {
    await showPing(id, push, "activity");
}

export function switchPingDetailPanel(pingId, panel) {
    const tabs = document.querySelector(`#detail-ping-${pingId} .ping-detail-tabs`);
    if (!tabs) return;

    tabs.querySelectorAll(".ping-detail-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.panel === panel);
    });
    tabs.querySelectorAll(".ping-detail-panel").forEach((tabPanel) => {
        tabPanel.classList.toggle("active", tabPanel.dataset.panel === panel);
    });
}

export function setupPingDetailListeners() {
    const backBtn = document.getElementById("ping-back-btn");
    if (backBtn) {
        backBtn.onclick = () => showFeed();
    }
}

window.showPing = showPing;
window.showPingActivity = showPingActivity;
window.switchPingDetailPanel = switchPingDetailPanel;
