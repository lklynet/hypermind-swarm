import { escapeHtml } from "./html.js";

function safeExternalUrl(value) {
    try {
        const url = new URL(value, window.location.origin);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return url.href;
    } catch {
        return null;
    }
}

export function renderMarkdown(text) {
    if (!text) return "";

    const tokens = [];
    const preserveHtml = (value) => {
        const marker = `\uE000HM_MARKDOWN_${tokens.length}\uE001`;
        tokens.push([marker, value]);
        return marker;
    };

    let source = String(text);

    source = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
        const safeUrl = safeExternalUrl(url.trim());
        if (!safeUrl) return `[image: ${alt || "blocked"}]`;
        return preserveHtml(
            `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="max-width: 100%; border-radius: 8px; margin: 0.5rem 0;">`
        );
    });

    source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
        const safeUrl = safeExternalUrl(url.trim());
        if (!safeUrl) return label;
        return preserveHtml(
            `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        );
    });

    let html = escapeHtml(source);

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
        '<span class="markdown-swarm" data-action="join-swarm" data-topic="$1">#$1</span>'
    );

    html = html.replace(
        /@(\w+)/g,
        '<span style="color: var(--primary-color); font-weight: 600;">@$1</span>'
    );

    for (const [marker, value] of tokens) {
        html = html.split(marker).join(value);
    }

    return html;
}

export function insertMarkdownAtCursor(input, before, after) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    const selected = text.substring(start, end);
    const replacement = before + selected + after;
    const hasSelection = start !== end;

    input.value = text.substring(0, start) + replacement + text.substring(end);
    input.focus();
    const newPos = hasSelection
        ? start + before.length + selected.length + after.length
        : start + before.length;
    input.setSelectionRange(newPos, newPos);

    input.dispatchEvent(new Event("input"));
}
