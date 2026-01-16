import { DOM, state } from "../core/state.js";
import { postComment } from "../core/api.js";
import { escapeHtml } from "../utils/html.js";
import { timeSince } from "../utils/formatters.js";
import { getColorFromId } from "../utils/banner-generator.js";
import { renderMarkdown, insertMarkdownAtCursor } from "../utils/markdown.js";
import { showToast } from "../utils/toast.js";
import { handleCommandInput } from "../commands/handler.js";

export function toggleComment(id) {
    const sections = document.querySelectorAll(`[id$="ping-${id}"] .comment-section`);
    sections.forEach((section) => {
        const isHidden = section.style.display === "none";
        section.style.display = isHidden ? "block" : "none";
        if (isHidden) {
            const input = section.querySelector(".comment-input");
            if (input) input.focus();
        }
    });
}

export function handleCommentKey(e, id) {
    if (e.key === "Enter") {
        submitComment(id);
    }
}

export async function submitComment(id) {
    const inputs = document.querySelectorAll(`[id$="ping-${id}"] .comment-input`);
    let content = "";
    let activeInput = null;

    for (const input of inputs) {
        if (input.value.trim()) {
            content = input.value.trim();
            activeInput = input;
            break;
        }
    }

    if (!content) return;

    if (await handleCommandInput(activeInput)) return;

    try {
        await postComment(id, content);
        inputs.forEach((input) => (input.value = ""));
        showToast("Reply sent!", "success");
    } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to send reply", "error");
    }
}

export function renderComment(c) {
    const avatarUrl = `/api/avatar/${c.author}`;
    const isFollowing = state.following.includes(c.author);

    return `
    <div class="comment-item">
      <div class="avatar comment-avatar" style="background-image: url('${avatarUrl}'); background-color: ${getColorFromId(c.author)}; cursor: pointer;" onclick="window.showProfile('${c.author}')"></div>
      <div class="comment-content">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="comment-author" style="cursor: pointer;" onclick="window.showProfile('${c.author}')">${escapeHtml(c.username || "Anonymous")}${isFollowing ? ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.75rem;" title="Following"></i>' : ""}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${timeSince(new Date(c.timestamp))}</span>
          </div>
          <button class="comment-reply-btn" onclick="window.replyToComment('${c.pingId || ""}', '${escapeHtml(c.username || "Anonymous")}')" title="Reply to this comment">
            <i class="fa-solid fa-reply"></i>
          </button>
        </div>
        <div class="comment-text">${renderMarkdown(c.content)}</div>
      </div>
    </div>
  `;
}

export function insertCommentMarkdown(pingId, before, after) {
    const inputs = document.querySelectorAll(`[id$="ping-${pingId}"] .comment-input`);
    let input = null;
    for (const i of inputs) {
        if (i.offsetParent !== null) {
            input = i;
            break;
        }
    }
    if (input) insertMarkdownAtCursor(input, before, after);
}

export function replyToComment(pingId, username) {
    if (!pingId) return;

    const sections = document.querySelectorAll(`[id$="ping-${pingId}"] .comment-section`);
    sections.forEach((section) => {
        section.style.display = "block";
        const input = section.querySelector(".comment-input");
        if (input) {
            if (input.value.startsWith("@")) {
                input.value = input.value.replace(/^@[^\s]+\s?/, `@${username} `);
            } else {
                input.value = `@${username} ` + input.value;
            }
            input.focus();
            const pos = input.value.length;
            input.setSelectionRange(pos, pos);
        }
    });
}

export function renderCommentSection(pingId, comments = [], isDetailView = false) {
    const displayStyle = isDetailView ? "block" : "none";
    const commentsHeader = isDetailView && comments.length > 0
        ? `<div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 1rem;">Comments</div>`
        : "";

    return `
        <div class="comment-section" style="display: ${displayStyle};">
            <div class="comment-input-wrapper">
                <input type="text" class="comment-input" placeholder="Write a comment..." onkeydown="window.handleCommentKey(event, '${pingId}')">
            </div>
            <div class="compose-actions" style="margin-bottom: 0.5rem;">
                <div class="markdown-toolbar">
                    <button type="button" onclick="window.insertCommentMarkdown('${pingId}', '**', '**')" title="Bold"><i class="fa-solid fa-bold" style="font-size: 0.8rem;"></i></button>
                    <button type="button" onclick="window.insertCommentMarkdown('${pingId}', '*', '*')" title="Italic"><i class="fa-solid fa-italic" style="font-size: 0.8rem;"></i></button>
                    <button type="button" onclick="window.insertCommentMarkdown('${pingId}', '__', '__')" title="Underline"><i class="fa-solid fa-underline" style="font-size: 0.8rem;"></i></button>
                    <button type="button" onclick="window.insertCommentMarkdown('${pingId}', '~~', '~~')" title="Strikethrough"><i class="fa-solid fa-strikethrough" style="font-size: 0.8rem;"></i></button>
                    <button type="button" onclick="window.insertCommentMarkdown('${pingId}', '[', '](url)')" title="Link"><i class="fa-solid fa-link" style="font-size: 0.8rem;"></i></button>
                    <button type="button" onclick="window.insertCommentMarkdown('${pingId}', '![alt](', ')')" title="Image"><i class="fa-solid fa-image" style="font-size: 0.8rem;"></i></button>
                </div>
                <button onclick="window.submitComment('${pingId}')" style="margin-left: auto; background: var(--primary-color); color: var(--color-bg); border: none; border-radius: 9999px; padding: 0.25rem 1rem; font-weight: 700; cursor: pointer;">Reply</button>
            </div>
            ${commentsHeader}
            <div class="comments-list">
                ${comments.map((c) => renderComment({ ...c, pingId })).join("")}
            </div>
        </div>
    `;
}

window.toggleComment = toggleComment;
window.handleCommentKey = handleCommentKey;
window.submitComment = submitComment;
window.insertCommentMarkdown = insertCommentMarkdown;
window.replyToComment = replyToComment;
