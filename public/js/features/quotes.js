import { state } from "../core/state.js";
import { fetchPing, postQuote } from "../core/api.js";
import { closeModal, showModal } from "../utils/modal.js";
import { escapeHtml } from "../utils/html.js";
import { renderMarkdown } from "../utils/markdown.js";
import { timeSince } from "../utils/formatters.js";
import { showToast } from "../utils/toast.js";

export function renderQuotedPingCard(ping) {
    const quoted = ping?.quotedPing;
    if (!quoted) return "";

    const authorName = quoted.username || state.usernameCache.get(quoted.author) || "Anonymous";
    const timestamp = quoted.timestamp ? timeSince(new Date(quoted.timestamp)) : "";

    return `
        <div class="quoted-ping-card" onclick="event.stopPropagation(); window.showPing('${quoted.id}')">
            <div class="quoted-ping-header">
                <span class="quoted-ping-author">${escapeHtml(authorName)}</span>
                <span class="quoted-ping-handle">@${quoted.author.slice(-8)}</span>
                ${timestamp ? `<span class="quoted-ping-time">· ${timestamp}</span>` : ""}
            </div>
            <div class="quoted-ping-text">${renderMarkdown(quoted.content || "")}</div>
        </div>
    `;
}

function buildQuoteModal(ping) {
    const wrapper = document.createElement("div");
    wrapper.className = "quote-compose";
    wrapper.innerHTML = `
        <textarea id="quote-compose-input" maxlength="280" placeholder="Add your thought..."></textarea>
        <div class="quote-compose-preview">
            ${renderQuotedPingCard({ quotedPing: ping })}
        </div>
        <div class="quote-compose-actions">
            <span id="quote-compose-count">0/280</span>
            <button id="quote-compose-submit">Quote</button>
        </div>
    `;

    const input = wrapper.querySelector("#quote-compose-input");
    const count = wrapper.querySelector("#quote-compose-count");
    const submit = wrapper.querySelector("#quote-compose-submit");

    input.addEventListener("input", () => {
        const length = input.value.length;
        count.textContent = `${length}/280`;
        count.classList.toggle("near-limit", length >= 260);
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit.click();
        }
    });

    submit.addEventListener("click", async () => {
        const content = input.value.trim();
        if (!content) return;

        submit.disabled = true;
        try {
            await postQuote(ping.id, content, state.currentTopic);
            closeModal();
            showToast("Quote sent", "success");
        } catch (e) {
            console.error(e);
            showToast(e.message || "Failed to quote ping", "error");
            submit.disabled = false;
        }
    });

    setTimeout(() => input.focus(), 50);
    return wrapper;
}

export async function quotePing(id) {
    try {
        const ping = await fetchPing(id);
        showModal({
            title: "Quote ping",
            content: buildQuoteModal(ping),
        });
    } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to load ping", "error");
    }
}

window.quotePing = quotePing;
