import { escapeHtml } from "./html.js";

export function renderMarkdown(text) {
    if (!text) return "";

    let html = escapeHtml(text);

    html = html.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px; margin: 0.5rem 0;">'
    );

    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/__(.+?)__/g, "<u>$1</u>");
    html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
    html = html.replace(/`(.+?)`/g, "<code>$1</code>");

    html = html.replace(
        /^&gt;(.+)$/gm,
        '<blockquote style="border-left: 3px solid var(--primary-color); padding-left: 0.75rem; margin: 0.5rem 0; color: var(--text-muted);">$1</blockquote>'
    );

    html = html.replace(
        /#(\w+)/g,
        '<span style="color: var(--primary-color); cursor: pointer;" onclick="event.stopPropagation(); window.joinSwarm(\'$1\')">#$1</span>'
    );

    html = html.replace(
        /@(\w+)/g,
        '<span style="color: var(--primary-color); font-weight: 600;">@$1</span>'
    );

    html = html.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); text-decoration: none;">$1</a>'
    );

    return html;
}

export function insertMarkdownAtCursor(input, before, after) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    const selected = text.substring(start, end);
    const replacement = before + selected + after;

    input.value = text.substring(0, start) + replacement + text.substring(end);
    input.focus();
    const newPos = start + before.length + selected.length + after.length;
    input.setSelectionRange(newPos, newPos);

    input.dispatchEvent(new Event("input"));
}
