import { DOM, state } from "../core/state.js";
import { postPing, postAmplify } from "../core/api.js";
import { escapeHtml } from "../utils/html.js";
import { timeSince } from "../utils/formatters.js";
import { getColorFromId } from "../utils/banner-generator.js";
import { renderMarkdown, insertMarkdownAtCursor } from "../utils/markdown.js";
import { showToast } from "../utils/toast.js";
import { renderComment, renderCommentSection } from "./comments.js";
import { handleCommandInput, getActionHighlightSpec } from "../commands/handler.js";
import { updateUrl } from "../utils/url.js";

const measureCanvas = document.createElement("canvas");
const measureContext = measureCanvas.getContext("2d");

function getPrefixCutoffPx(input, prefixLength) {
    if (!measureContext || !input) return 0;
    const style = window.getComputedStyle(input);
    measureContext.font = style.font || `${style.fontSize} ${style.fontFamily}`;
    const prefixText = input.value.slice(0, prefixLength);
    const textWidth = measureContext.measureText(prefixText).width;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    return Math.ceil(paddingLeft + textWidth);
}

export function switchTab(tab, push = true) {
    state.currentTab = tab;
    if (push) updateUrl({ t: tab, u: null, p: null });

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
        list.innerHTML = ping.comments.map((c) => renderComment({ ...c, pingId: ping.id })).join("");
    }
}

function updatePingInputState() {
    if (!DOM.pingInput) return;
    const { mode, prefixLength } = getActionHighlightSpec(DOM.pingInput.value);

    DOM.pingInput.classList.toggle("input-action-full", mode === "full");
    DOM.pingInput.classList.toggle("input-action-prefix", mode === "prefix");
    if (mode === "prefix") {
        const cutoffPx = getPrefixCutoffPx(DOM.pingInput, prefixLength);
        DOM.pingInput.style.setProperty("--action-cutoff-px", `${cutoffPx}px`);
    } else {
        DOM.pingInput.style.removeProperty("--action-cutoff-px");
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
    el.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('.ping-author') || e.target.closest('.ping-handle') || e.target.closest('.ping-topic') || e.target.closest('.ping-avatar') || e.target.closest('a') || e.target.closest('.comment-input') || e.target.closest('.markdown-toolbar')) {
            return;
        }
        window.showPing(ping.id);
    };

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
        topicPill = `<span class="ping-topic" onclick="event.stopPropagation(); window.joinSwarm('${escapeHtml(ping.topic)}')">#${escapeHtml(ping.topic)}</span>`;
    }

    el.innerHTML = `
    <div class="avatar ping-avatar" style="background-image: url('${avatarUrl}'); background-color: ${getColorFromId(ping.author)};" onclick="window.showProfile('${ping.author}')"></div>
    <div class="ping-content">
      <div class="ping-header">
        <span class="ping-author" onclick="window.showProfile('${ping.author}')" style="cursor: pointer;">${escapeHtml(authorName)}${isFollowing ? ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.85rem;" title="Following"></i>' : ""}</span>
        <span class="ping-handle" onclick="event.stopPropagation(); window.showPing('${ping.id}')">@${ping.author.slice(-8)}</span>
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
        <button class="action-btn share" onclick="window.sharePing('${ping.id}')">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
      ${renderCommentSection(ping.id, ping.comments || [])}
    </div>
  `;

    return el;
}

export async function sendPing() {
    const content = DOM.pingInput.value.trim();
    if (!content) return;

    if (await handleCommandInput(DOM.pingInput)) return;

    try {
        await postPing(content, state.currentTopic);
        DOM.pingInput.value = "";
        DOM.pingInput.classList.remove("input-action-full", "input-action-prefix");
        DOM.pingInput.style.removeProperty("--action-cutoff-px");
        DOM.charCount.style.display = "none";
        showToast("Ping sent!", "success");
        if (window.innerWidth < 1000) {
            const composeArea = document.getElementById("compose-area");
            const trigger = document.getElementById("mobile-post-trigger");
            if (composeArea) composeArea.classList.remove("active");
            if (trigger) trigger.classList.remove("hidden");
        }
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

export async function sharePing(id) {
    try {
        const pingUrl = `${window.location.origin}/?p=${id}`;
        await navigator.clipboard.writeText(pingUrl);
        showToast("Ping copied", "success");
    } catch (e) {
        console.error(e);
        showToast("Failed to copy ping", "error");
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
            updatePingInputState();

            if (currentLength >= 280) {
                DOM.charCount.style.color = "var(--color-red)";
            } else if (currentLength >= 260) {
                DOM.charCount.style.color = "var(--color-gold)";
            } else {
                DOM.charCount.style.color = "var(--primary-color)";
            }
        });

        DOM.pingInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendPing();
            }
        });

        updatePingInputState();
    }
}

export function insertMarkdown(before, after) {
    if (DOM.pingInput) {
        insertMarkdownAtCursor(DOM.pingInput, before, after);
    }
}

export function toggleMobileCompose() {
    const composeArea = document.getElementById("compose-area");
    const trigger = document.getElementById("mobile-post-trigger");
    if (composeArea && trigger) {
        composeArea.classList.add("active");
        trigger.classList.add("hidden");
        setTimeout(() => {
            const input = document.getElementById("ping-input");
            if (input) input.focus();
        }, 50);
    }
}

window.toggleMobileCompose = toggleMobileCompose;
window.amplifyPing = amplifyPing;
window.sharePing = sharePing;
window.switchTab = switchTab;
window.insertMarkdown = insertMarkdown;
