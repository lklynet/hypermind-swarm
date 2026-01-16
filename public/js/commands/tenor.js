import { registerCommand } from "./registry.js";
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

    if (!res.ok) throw new Error("API request failed");

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      resultsEl.innerHTML = '<div class="gif-loading">No GIFs found</div>';
      return;
    }

    resultsEl.innerHTML = data.results
      .map((gif) => {
        const previewUrl = gif.media_formats.tinygif?.url || gif.media_formats.gif?.url;
        const fullUrl = gif.media_formats.gif?.url;
        return `
          <div class="gif-item" onclick="window.selectGif('${fullUrl}')">
            <img src="${previewUrl}" alt="${gif.content_description || 'GIF'}" loading="lazy">
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("Tenor search failed:", e);
    resultsEl.innerHTML = `<div class="gif-loading">Search failed: ${e.message}</div>`;
  }
}

function createPickerContent(initialQuery) {
  const container = document.createElement("div");
  container.innerHTML = `
    <div class="gif-picker-search">
      <input type="text" id="gif-search-input" placeholder="Search GIFs..." autocomplete="off" />
    </div>
    <div class="gif-picker-results" id="gif-results"></div>
  `;

  const searchInput = container.querySelector("#gif-search-input");
  let debounceTimer;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchGifs(e.target.value), 300);
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
  description: "Search and insert a GIF from Tenor",
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
