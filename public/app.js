import { state, DOM } from "./js/core/state.js";
import { fetchWhoami, fetchPings } from "./js/core/api.js";
import { startSSE, setSSECallbacks, setupTabVisibility } from "./js/core/sse.js";

import { updateStats } from "./js/features/stats.js";
import { addPingToFeed, addPingToContainer, setupFeedListeners, switchTab } from "./js/features/feed.js";
import { renderSwarmTags, initSwarms, setupSwarmListeners } from "./js/features/swarm.js";
import { fetchTrending } from "./js/features/trending.js";
import { renderFollowedAccounts, updateMyProfileWidget, showProfile, showFeed } from "./js/features/profile.js";
import { setupMobileNavigation } from "./js/features/mobile-nav.js";
import { getUrlParams } from "./js/utils/url.js";

import "./js/features/comments.js";

import "./js/commands/help.js";
import "./js/commands/tenor.js";

function syncStateFromUrl() {
  const { userId, tab } = getUrlParams();
  if (userId) {
    showProfile(userId, false);
  } else {
    showFeed(false);
  }
  if (tab) {
    switchTab(tab, false);
  }
}

async function init() {
  try {
    const data = await fetchWhoami();
    state.myId = data.id;
    updateMyProfileWidget(data);
  } catch (e) {
    console.error("Failed to fetch identity", e);
  }

  renderSwarmTags();
  renderFollowedAccounts();

  syncStateFromUrl();
  window.addEventListener('popstate', syncStateFromUrl);

  if (DOM.pingInput) {
    DOM.pingInput.placeholder = "What is happening in Global?!";
  }

  await initSwarms();

  try {
    const pings = await fetchPings();
    for (const ping of pings) {
      addPingToFeed(ping, false);
    }
  } catch (e) {
    console.error("Failed to fetch pings", e);
  }

  await fetchTrending();

  setSSECallbacks({
    onInit: (data) => {
      state.myId = data.id;
      updateMyProfileWidget(data);
      updateStats(data);
    },
    onUpdate: (data) => {
      updateStats(data);
    },
    onPing: (data) => {
      addPingToFeed(data, true);
      if (state.currentProfileId === data.author) {
        addPingToContainer(data, DOM.profileFeed, true);
      }
    },
  });

  if (document.readyState === "complete") {
    startSSE();
  } else {
    window.addEventListener("load", startSSE);
  }

  setupTabVisibility();
  setupFeedListeners();
  setupSwarmListeners();
  setupMobileNavigation();
}

init();
