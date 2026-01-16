export function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function setText(id, val) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = val;
    }
}
