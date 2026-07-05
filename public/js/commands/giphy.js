import { registerCommand } from "./handler.js";
import { showModal, closeModal } from "../utils/modal.js";

let currentResolve = null;

async function searchGifs(query) {
  const resultsEl = document.getElementById("gif-results");
  if (!resultsEl) return;

  if (!query || !query.trim()) {
    resultsEl.innerHTML = '<div class="gif-loading">Type to search...</div>';
    return;
  }

  resultsEl.innerHTML = '<div class="gif-loading">Searching...</div>';

  try {
    const res = await fetch(`/api/gif/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details?.message || data.error || "API Error");
    }

    if (!data.data || data.data.length === 0) {
      resultsEl.innerHTML = '<div class="gif-loading">No GIFs found</div>';
      return;
    }

    resultsEl.innerHTML = data.data
      .map((gif) => {
        const previewUrl = gif.images.fixed_height_small.url;
        const fullUrl = gif.images.original.url;
        const title = gif.title || 'GIF';

        return `
          <div class="gif-item" onclick="window.selectGif('${fullUrl}')">
            <img src="${previewUrl}" alt="${title}" loading="lazy" title="${title}">
          </div>
        `;
      })
      .join("");
  } catch (e) {
    resultsEl.innerHTML = `<div class="gif-loading" style="color:red">Error: ${e.message}</div>`;
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
       <img src="https://developers.giphy.com/branch/master/static/header-logo-0fec0225d189bc0eae27dac3e3770582.gif" width="50" alt="Powered by GIPHY">
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