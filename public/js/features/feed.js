import { DOM, state } from "../core/state.js";
import { postPing, postAmplify } from "../core/api.js";
import { escapeHtml } from "../utils/html.js";
import { timeSince } from "../utils/formatters.js";
import { getColorFromId } from "../utils/colors.js";
import { renderMarkdown, insertMarkdownAtCursor } from "../utils/markdown.js";
import { showToast } from "../utils/toast.js";
import { renderComment } from "./comments.js";

export function switchTab(tab) {
    state.currentTab = tab;

    document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");

    updateFeedVisibility();
}

export function updateFeedVisibility() {
    const pings = DOM.feedEl.querySelectorAll(".ping");
    pings.forEach((el) => {
        const pingSwarmId = parseInt(el.dataset.swarmId || "0");
        const authorId = el.dataset.author;

        let visible = true;

        if (state.currentSwarmId !== 0 && pingSwarmId !== state.currentSwarmId) {
            visible = false;
        }

        if (state.currentTab === "following") {
            if (!state.following.includes(authorId) && authorId !== state.myId) {
                visible = false;
            }
        }

        el.style.display = visible ? "flex" : "none";
    });
}

export function addPingToFeed(ping, prepend = false) {
    addPingToContainer(ping, DOM.feedEl, prepend);
}

export function addPingToContainer(ping, container, prepend = false) {
    if (state.blocked.includes(ping.author)) return;

    if (ping.username) {
        state.usernameCache.set(ping.author, ping.username);
    }

    const isProfile = container === DOM.profileFeed;
    const domId = isProfile ? `profile-ping-${ping.id}` : `ping-${ping.id}`;
    const existingEl = document.getElementById(domId);

    if (existingEl) {
        updateExistingPing(existingEl, ping);
        return;
    }

    const el = createPingElement(ping, domId, isProfile);

    if (prepend) {
        container.prepend(el);
    } else {
        container.appendChild(el);
    }
}

function updateExistingPing(el, ping) {
    const countEl = el.querySelector(".amplify-count");
    if (countEl) countEl.textContent = ping.likes || 0;

    const commentCountEl = el.querySelector(".comment-count");
    if (commentCountEl) {
        commentCountEl.textContent = ping.comments ? ping.comments.length : 0;
    }

    const list = el.querySelector(".comments-list");
    if (list && ping.comments) {
        list.innerHTML = ping.comments.map((c) => renderComment(c)).join("");
    }
}

function createPingElement(ping, domId, isProfile) {
    const swarmId = ping.swarmId || 0;
    const isMe = ping.author === state.myId;

    const el = document.createElement("div");
    el.className = "ping";
    el.id = domId;
    el.dataset.swarmId = swarmId;
    el.dataset.author = ping.author;

    if (!isProfile) {
        if (state.currentSwarmId !== 0 && swarmId !== state.currentSwarmId) {
            el.style.display = "none";
        }
        if (state.currentTab === "following" && !state.following.includes(ping.author) && !isMe) {
            el.style.display = "none";
        }
    }

    const authorName = ping.username || "Anonymous";
    const avatarUrl = `/api/avatar/${ping.author}`;
    const isFollowing = state.following.includes(ping.author);

    let topicPill = "";
    if (ping.topic) {
        topicPill = `<span style="color: var(--primary-color); cursor: pointer;" onclick="event.stopPropagation(); window.joinSwarm('${escapeHtml(ping.topic)}')">#${escapeHtml(ping.topic)}</span>`;
    }

    el.innerHTML = `
    <div class="avatar ping-avatar" style="background-image: url('${avatarUrl}'); background-color: ${getColorFromId(ping.author)};" onclick="window.showProfile('${ping.author}')"></div>
    <div class="ping-content">
      <div class="ping-header">
        <span class="ping-author" onclick="window.showProfile('${ping.author}')" style="cursor: pointer;">${escapeHtml(authorName)}${isFollowing ? ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.85rem;" title="Following"></i>' : ""}</span>
        <span class="ping-handle">@${ping.author.slice(-8)}</span>
        <span class="ping-time">· ${timeSince(new Date(ping.timestamp))}</span>
        ${topicPill ? `<span style="margin-left: auto; font-size: 0.8rem;">${topicPill}</span>` : ""}
      </div>
      <div class="ping-text">${renderMarkdown(ping.content)}</div>
      <div class="ping-actions">
        <button class="action-btn amplify" onclick="window.amplifyPing('${ping.id}')">
          <i class="fa-solid fa-bullhorn"></i> <span class="amplify-count">${ping.likes || 0}</span>
        </button>
        <button class="action-btn comment" onclick="window.toggleComment('${ping.id}')">
          <i class="fa-regular fa-comment"></i> <span class="comment-count">${ping.comments ? ping.comments.length : 0}</span>
        </button>
      </div>
      <div class="comment-section" style="display: none;">
        <div class="comment-input-wrapper">
          <input type="text" class="comment-input" placeholder="Write a comment..." onkeydown="window.handleCommentKey(event, '${ping.id}')">
        </div>
        <div class="compose-actions" style="margin-bottom: 0.5rem;">
          <div class="markdown-toolbar">
            <button type="button" onclick="window.insertCommentMarkdown('${ping.id}', '**', '**')" title="Bold"><i class="fa-solid fa-bold" style="font-size: 0.8rem;"></i></button>
            <button type="button" onclick="window.insertCommentMarkdown('${ping.id}', '*', '*')" title="Italic"><i class="fa-solid fa-italic" style="font-size: 0.8rem;"></i></button>
            <button type="button" onclick="window.insertCommentMarkdown('${ping.id}', '__', '__')" title="Underline"><i class="fa-solid fa-underline" style="font-size: 0.8rem;"></i></button>
            <button type="button" onclick="window.insertCommentMarkdown('${ping.id}', '~~', '~~')" title="Strikethrough"><i class="fa-solid fa-strikethrough" style="font-size: 0.8rem;"></i></button>
            <button type="button" onclick="window.insertCommentMarkdown('${ping.id}', '[', '](url)')" title="Link"><i class="fa-solid fa-link" style="font-size: 0.8rem;"></i></button>
            <button type="button" onclick="window.insertCommentMarkdown('${ping.id}', '![alt](', ')')" title="Image"><i class="fa-solid fa-image" style="font-size: 0.8rem;"></i></button>
          </div>
          <button onclick="window.submitComment('${ping.id}')" style="margin-left: auto; background: var(--primary-color); color: var(--color-bg); border: none; border-radius: 9999px; padding: 0.25rem 1rem; font-weight: 700; cursor: pointer;">Reply</button>
        </div>
        <div class="comments-list">
          ${(ping.comments || []).map((c) => renderComment(c)).join("")}
        </div>
      </div>
    </div>
  `;

    return el;
}

export async function sendPing() {
    const content = DOM.pingInput.value.trim();
    if (!content) return;

    try {
        await postPing(content, state.currentTopic);
        DOM.pingInput.value = "";
        DOM.charCount.style.display = "none";
        showToast("Ping sent!", "success");
    } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to send ping", "error");
    }
}

export async function amplifyPing(id) {
    try {
        const data = await postAmplify(id);
        const countEls = document.querySelectorAll(`[id$="ping-${id}"] .amplify-count`);
        countEls.forEach((el) => (el.textContent = data.likes));
    } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to amplify", "error");
    }
}

export function setupFeedListeners() {
    if (DOM.pingBtn) {
        DOM.pingBtn.onclick = sendPing;
    }

    if (DOM.pingInput) {
        DOM.pingInput.addEventListener("input", () => {
            const currentLength = DOM.pingInput.value.length;
            DOM.charCount.style.display = currentLength > 0 ? "inline" : "none";
            DOM.charCount.textContent = `${currentLength}/280`;

            if (currentLength >= 280) {
                DOM.charCount.style.color = "var(--color-red)";
            } else if (currentLength >= 260) {
                DOM.charCount.style.color = "var(--color-gold)";
            } else {
                DOM.charCount.style.color = "var(--primary-color)";
            }
        });
    }
}

export function insertMarkdown(before, after) {
    if (DOM.pingInput) {
        insertMarkdownAtCursor(DOM.pingInput, before, after);
    }
}

window.amplifyPing = amplifyPing;
window.switchTab = switchTab;
window.insertMarkdown = insertMarkdown;
