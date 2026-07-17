import DOMPurify from "/vendor/dompurify.js";

export function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function sanitizeHtml(html) {
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["form", "iframe", "object", "embed", "svg", "math"],
        FORBID_ATTR: ["srcdoc"],
        ADD_ATTR: ["referrerpolicy", "target"],
    });
}

export function setSafeHtml(element, html) {
    if (element) element.innerHTML = sanitizeHtml(html);
}

export function setText(id, val) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = val;
    }
}
