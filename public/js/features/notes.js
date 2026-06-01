import { state } from "../core/state.js";
import { escapeHtml } from "../utils/html.js";
import { timeSince } from "../utils/formatters.js";
import { getColorFromId } from "../utils/banner-generator.js";
import { renderMarkdown } from "../utils/markdown.js";

function getCounts(ping) {
    return {
        total: 0,
        amplifies: 0,
        comments: 0,
        quotes: 0,
        ...(ping?.noteCounts || {}),
    };
}

export function renderNoteItem(note) {
    const authorName = note.username || state.usernameCache.get(note.author) || "Anonymous";
    const avatarUrl = `/api/avatar/${note.author}`;
    const timeLabel = note.timestamp ? timeSince(new Date(note.timestamp)) : "";
    let body = "amplified";
    let action = "";

    if (note.type === "comment") {
        body = `replied: <span class="note-text">${renderMarkdown(note.content || "")}</span>`;
    } else if (note.type === "quote") {
        body = `quoted: <span class="note-text">${renderMarkdown(note.content || "")}</span>`;
        if (note.quotePingId) {
            action = `<button class="note-link" onclick="event.stopPropagation(); window.showPing('${note.quotePingId}')">View quote</button>`;
        }
    }

    return `
        <div class="note-item">
            <div class="avatar note-avatar" style="background-image: url('${avatarUrl}'); background-color: ${getColorFromId(note.author)};" onclick="window.showProfile('${note.author}')"></div>
            <div class="note-content">
                <div class="note-line">
                    <span class="note-author" onclick="window.showProfile('${note.author}')">${escapeHtml(authorName)}</span>
                    <span class="note-body">${body}</span>
                    ${timeLabel ? `<span class="note-time">· ${timeLabel}</span>` : ""}
                </div>
                ${action}
            </div>
        </div>
    `;
}

export function renderNotesSection(ping) {
    const notes = [...(ping.notes || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const counts = getCounts(ping);
    if (!counts.total) return "";

    return `
        <div class="notes-section">
            <div class="notes-list">
                ${notes.map(renderNoteItem).join("")}
            </div>
        </div>
    `;
}
