import { state, DOM } from "./js/core/state.js";
import { initTheme } from "./js/core/theme.js";

initTheme();
import { fetchWhoami, fetchPings, fetchAuthStatus, loginAuth, logoutAuth } from "./js/core/api.js";
import { startSSE, setSSECallbacks, setupTabVisibility } from "./js/core/sse.js";

import { updateStats } from "./js/features/stats.js";
import { addPingToFeed, addPingToContainer, setupFeedListeners, switchTab } from "./js/features/feed.js";
import { renderSwarmTags, initSwarms, setupSwarmListeners } from "./js/features/swarm.js";
import { fetchTrending } from "./js/features/trending.js";
import { renderFollowedAccounts, updateMyProfileWidget, showProfile, showFeed } from "./js/features/profile.js";
import { setupMobileNavigation } from "./js/features/mobile-nav.js";
import { getUrlParams } from "./js/utils/url.js";
import { showPing, setupPingDetailListeners } from "./js/features/ping-detail.js";
import { notificationManager, setupNotificationListeners } from "./js/features/notifications.js";
import { renderComment } from "./js/features/comments.js";
import { renderNotesSection } from "./js/features/notes.js";
import { setSafeHtml } from "./js/utils/html.js";

import "./js/features/comments.js";
import "./js/features/quotes.js";

import "./js/commands/help.js";
import "./js/commands/giphy.js";

function setupActionDelegation() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action, pingId, userId, topic, tab, before, after, username, url, panel } = target.dataset;
    event.stopPropagation();

    const actions = {
      "show-feed": () => window.showFeed(),
      "show-my-profile": () => window.showMyProfile(),
      "cycle-theme": () => window.cycleTheme(),
      "switch-tab": () => window.switchTab(tab),
      "toggle-mobile-compose": () => window.toggleMobileCompose(),
      "insert-markdown": () => window.insertMarkdown(before || "", after || ""),
      "join-swarm": () => window.joinSwarm(topic),
      "show-profile": () => window.showProfile(userId),
      "show-ping": () => window.showPing(pingId),
      "toggle-follow": () => window.toggleFollow(userId),
      "share-ping": () => window.sharePing(pingId),
      "amplify-ping": () => window.amplifyPing(pingId),
      "toggle-comment": () => window.toggleComment(pingId),
      "quote-ping": () => window.quotePing(pingId),
      "show-activity": () => window.showPingActivity(pingId),
      "detail-panel": () => window.switchPingDetailPanel(pingId, panel),
      "reply-comment": () => window.replyToComment(pingId, username),
      "submit-comment": () => window.submitComment(pingId, target),
      "comment-markdown": () => window.insertCommentMarkdown(pingId, before || "", after || "", target),
      "select-gif": () => window.selectGif(url),
    };
    actions[action]?.();
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches(".comment-input")) window.handleCommentInput(event);
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.matches(".comment-input")) {
      window.handleCommentKey(event, event.target.dataset.pingId);
    }
  });
}

setupActionDelegation();

const authScreen = document.getElementById("auth-screen");
const authForm = document.getElementById("auth-form");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const authError = document.getElementById("auth-error");
const logoutBtn = document.getElementById("logout-btn");
const profileMenuBtn = document.getElementById("profile-menu-btn");
const profileMenu = document.getElementById("profile-menu");
const appContainer = document.querySelector(".app-container");
let appStarted = false;

function syncStateFromUrl() {
  const { userId, pingId, tab } = getUrlParams();
  if (pingId) {
    showPing(pingId, false);
  } else if (userId) {
    showProfile(userId, false);
  } else {
    showFeed(false);
  }
  if (tab) {
    switchTab(tab, false);
  }
}

function setLogoutVisibility(visible) {
  if (!profileMenuBtn || !profileMenu) return;
  profileMenuBtn.style.display = visible ? "flex" : "none";
  if (!visible) {
    profileMenu.classList.remove("open");
  }
}

function setProfileMenuOpen(open) {
  if (!profileMenu) return;
  profileMenu.classList.toggle("open", open);
}

function showAuthScreen(message = "") {
  if (authScreen) authScreen.style.display = "flex";
  if (appContainer) appContainer.style.display = "none";
  if (authError) authError.textContent = message;
  if (authUsernameInput) authUsernameInput.focus();
}

function hideAuthScreen() {
  if (authScreen) authScreen.style.display = "none";
  if (appContainer) appContainer.style.display = "";
  if (authError) authError.textContent = "";
  if (authPasswordInput) authPasswordInput.value = "";
}

async function startApp() {
  if (appStarted) return;
  appStarted = true;
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
      if (data.username) {
        state.usernameCache.set(data.id, data.username);
      }
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

      const pingView = document.getElementById("ping-view");
      if (pingView && pingView.style.display === "block") {
        const detailPing = document.querySelector(`#detail-ping-${data.id}`);
        if (detailPing) {
          const amplifyCountEl = detailPing.querySelector(".amplify-count");
          if (amplifyCountEl) {
            amplifyCountEl.textContent = data.likes || 0;
          }
          const commentCountEl = detailPing.querySelector(".comment-count");
          if (commentCountEl) {
            commentCountEl.textContent = data.comments ? data.comments.length : 0;
          }
          const quoteCountEl = detailPing.querySelector(".quote-count");
          if (quoteCountEl) {
            quoteCountEl.textContent = data.noteCounts ? data.noteCounts.quotes || 0 : 0;
          }
          const commentsList = detailPing.querySelector(".comments-list");
          if (commentsList && data.comments) {
            setSafeHtml(commentsList, data.comments.map((c) => renderComment({ ...c, pingId: data.id })).join(""));
          }
          const repliesTabCount = detailPing.querySelector('.ping-detail-tab[data-panel="replies"] span');
          if (repliesTabCount) {
            repliesTabCount.textContent = data.comments ? data.comments.length : 0;
          }
          const activityTabCount = detailPing.querySelector('.ping-detail-tab[data-panel="activity"] span');
          if (activityTabCount) {
            activityTabCount.textContent = data.noteCounts ? data.noteCounts.total || 0 : 0;
          }
          const activityPanel = detailPing.querySelector('.ping-detail-panel[data-panel="activity"]');
          if (activityPanel) {
            setSafeHtml(activityPanel, renderNotesSection(data) || `<div class="activity-empty">No activity yet.</div>`);
          }
        }
      }

      notificationManager.addPingNotification(data);

      if (data.comments && data.comments.length > 0) {
        data.comments.forEach(comment => {
          notificationManager.addCommentNotification(data, comment);
        });
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
  setupPingDetailListeners();
  setupNotificationListeners();
}

async function initAuth() {
  if (profileMenuBtn && profileMenu) {
    profileMenuBtn.onclick = (event) => {
      event.stopPropagation();
      setProfileMenuOpen(!profileMenu.classList.contains("open"));
    };
    profileMenu.onclick = (event) => {
      event.stopPropagation();
    };
    document.addEventListener("click", () => {
      setProfileMenuOpen(false);
    });
  }

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      setProfileMenuOpen(false);
      try {
        await logoutAuth();
      } catch (e) {
        console.error("Logout failed", e);
      }
      window.location.reload();
    };
  }

  window.addEventListener("auth-required", () => {
    setLogoutVisibility(false);
    showAuthScreen("Session expired. Sign in again.");
  });

  if (authForm) {
    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = authUsernameInput?.value || "";
      const password = authPasswordInput?.value || "";
      try {
        await loginAuth(username, password);
        hideAuthScreen();
        setLogoutVisibility(true);
        await startApp();
      } catch (e) {
        if (authError) authError.textContent = e.message || "Login failed";
      }
    });
  }

  try {
    const status = await fetchAuthStatus();
    if (status.enabled && !status.authenticated) {
      setLogoutVisibility(false);
      showAuthScreen();
      return;
    }
    hideAuthScreen();
    setLogoutVisibility(Boolean(status.enabled));
    await startApp();
  } catch (e) {
    console.error("Auth init failed", e);
    hideAuthScreen();
    setLogoutVisibility(false);
    await startApp();
  }
}

(function() {
  const handle = document.getElementById("sidebar-resize-handle");
  if (!handle) return;
  const container = document.querySelector(".app-container");
  const saved = localStorage.getItem("sidebar-width");
  if (saved) container.style.setProperty("--sidebar-width", saved);

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = parseInt(getComputedStyle(container).getPropertyValue("--sidebar-width")) || 275;
    handle.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(180, Math.min(400, startWidth + diff));
    container.style.setProperty("--sidebar-width", newWidth + "px");
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const width = container.style.getPropertyValue("--sidebar-width");
    localStorage.setItem("sidebar-width", width);
  });
})();

initAuth();
