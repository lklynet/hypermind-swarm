import { registerCommand } from "./handler.js";
import { showModal, closeModal } from "../utils/modal.js";
import { escapeHtml, setSafeHtml } from "../utils/html.js";

let currentResolve = null;

async function searchGifs(query) {
  const resultsEl = document.getElementById("gif-results");
  if (!resultsEl) return;

  if (!query || !query.trim()) {
    setSafeHtml(resultsEl, '<div class="gif-loading">Type to search...</div>');
    return;
  }

  setSafeHtml(resultsEl, '<div class="gif-loading">Searching...</div>');

  try {
    const res = await fetch(`/api/gif/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details?.message || data.error || "API Error");
    }

    if (!data.data || data.data.length === 0) {
      setSafeHtml(resultsEl, '<div class="gif-loading">No GIFs found</div>');
      return;
    }

    const safeGiphyUrl = (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && (url.hostname === "giphy.com" || url.hostname.endsWith(".giphy.com"))
          ? url.href
          : "";
      } catch {
        return "";
      }
    };
    setSafeHtml(resultsEl, data.data
      .map((gif) => {
        const previewUrl = safeGiphyUrl(gif.images?.fixed_height_small?.url);
        const fullUrl = safeGiphyUrl(gif.images?.original?.url);
        const title = escapeHtml(gif.title || "GIF");
        if (!previewUrl || !fullUrl) return "";

        return `
          <div class="gif-item" data-action="select-gif" data-url="${escapeHtml(fullUrl)}">
            <img src="${escapeHtml(previewUrl)}" alt="${title}" loading="lazy" title="${title}">
          </div>
        `;
      })
      .join(""));
  } catch (e) {
    resultsEl.textContent = `Error: ${e.message}`;
  }
}

function createPickerContent(initialQuery) {
  const container = document.createElement("div");
  container.innerHTML = `
    <div class="gif-picker-search">
      <input type="text" id="gif-search-input" placeholder="Search GIPHY..." autocomplete="off" />
    </div>
    <div class="gif-picker-results" id="gif-results"></div>
    <div class="gif-attribution" style="text-align: right; font-size: 10px; opacity: 0.7; padding: 5px;">
       Powered by GIPHY
    </div>
  `;

  const searchInput = container.querySelector("#gif-search-input");
  let debounceTimer;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchGifs(e.target.value), 500);
  });

  searchInput.value = initialQuery || "";

  return container;
}

function openPicker(query) {
  return new Promise((resolve) => {
    if (currentResolve) {
      currentResolve(null);
    }
    currentResolve = resolve;

    const content = createPickerContent(query);

    showModal({
      title: "Select a GIF",
      content: content,
      onClose: () => {
        if (currentResolve) {
          currentResolve(null);
          currentResolve = null;
        }
      }
    });

    searchGifs(query || "");
    setTimeout(() => {
      const input = document.getElementById("gif-search-input");
      if (input) input.focus();
    }, 50);
  });
}

window.selectGif = (url) => {
  if (currentResolve) {
    currentResolve(url);
    currentResolve = null;
  }
  closeModal();
};

registerCommand({
  name: "gif",
  description: "Search and insert a GIF from GIPHY",
  execute: async (args, context) => {
    const selectedUrl = await openPicker(args);

    if (selectedUrl) {
      return {
        type: "insert",
        content: `![gif](${selectedUrl})`
      };
    }

    return { type: "cancelled" };
  },
});
