const feed = document.getElementById("feed");
const pingInput = document.getElementById("ping-input");
const pingBtn = document.getElementById("ping-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const myIdEl = document.getElementById("my-id");
const charCount = document.getElementById("char-count");

myIdEl.onclick = () => {
  if (myId) showProfile(myId);
};

const swarmInput = document.getElementById("swarm-input");
const joinSwarmBtn = document.getElementById("join-swarm-btn");
const activeSwarmsEl = document.getElementById("active-swarms");
const trendingTitle = document.getElementById("trending-title");
const profileView = document.getElementById("profile-view");
const profileInfo = document.getElementById("profile-info");
const profileFeed = document.getElementById("profile-feed");
const feedEl = document.getElementById("feed");
const composeArea = document.querySelector(".compose-area");
const swarmControls = document.querySelector(".swarm-controls");

let myId = "";
let currentTopic = "";
let currentSwarmId = 0;
let joinedSwarms = JSON.parse(localStorage.getItem("joinedSwarms") || '[""]');
let following = JSON.parse(localStorage.getItem("following") || "[]");
let blocked = JSON.parse(localStorage.getItem("blocked") || "[]");
let collapsedSections = JSON.parse(
  localStorage.getItem("collapsedSections") || "[]"
);

function toggleSection(name) {
  const section = document.getElementById(`section-${name}`);
  if (!section) return;

  const isProfile = profileView.style.display === "block";
  const viewPrefix = isProfile ? "profile" : "feed";
  const storageKey = `${viewPrefix}-${name}`;

  const isCollapsed = section.classList.toggle("collapsed");

  if (isCollapsed) {
    if (!collapsedSections.includes(storageKey))
      collapsedSections.push(storageKey);
  } else {
    collapsedSections = collapsedSections.filter((s) => s !== storageKey);
  }

  localStorage.setItem("collapsedSections", JSON.stringify(collapsedSections));
}

function initSections() {
  const isProfile = profileView.style.display === "block";
  const viewPrefix = isProfile ? "profile" : "feed";

  document
    .querySelectorAll(".sidebar-section")
    .forEach((s) => s.classList.remove("collapsed"));

  collapsedSections.forEach((key) => {
    if (key.startsWith(`${viewPrefix}-`)) {
      const name = key.replace(`${viewPrefix}-`, "");
      const section = document.getElementById(`section-${name}`);
      if (section) section.classList.add("collapsed");
    }
  });
}

function toggleFollow(id) {
  const isFollowing = !following.includes(id);
  if (following.includes(id)) {
    following = following.filter((f) => f !== id);
  } else {
    following.push(id);
  }
  localStorage.setItem("following", JSON.stringify(following));
  renderFollowedAccounts();

  document.querySelectorAll(`.ping[data-author="${id}"]`).forEach((el) => {
    const check = el.querySelector(".follow-check");
    if (check) check.style.display = isFollowing ? "inline" : "none";

    const menuFollowItem = el.querySelector(
      ".ping-menu .menu-item:first-child"
    );
    if (menuFollowItem) {
      menuFollowItem.innerHTML = `
        <i class="fa-solid ${
          isFollowing ? "fa-user-minus" : "fa-user-plus"
        }"></i>
        <span>${isFollowing ? "Unfollow" : "Follow"}</span>
      `;
    }
  });

  if (profileView.style.display === "block") {
    const profileFollowBtn = profileInfo.querySelector(".btn-follow");
    const profileCheck = profileInfo.querySelector(".follow-check");

    if (profileFollowBtn) {
      profileFollowBtn.classList.toggle("active", isFollowing);
      profileFollowBtn.innerHTML = `
        <i class="fa-solid ${
          isFollowing ? "fa-user-minus" : "fa-user-plus"
        }"></i>
        ${isFollowing ? "Unfollow" : "Follow"}
      `;
    }
    if (profileCheck)
      profileCheck.style.display = isFollowing ? "inline" : "none";
  }
}

function toggleBlock(id) {
  const isBlocking = !blocked.includes(id);
  if (blocked.includes(id)) {
    blocked = blocked.filter((b) => b !== id);
  } else {
    blocked.push(id);
    if (following.includes(id)) {
      following = following.filter((f) => f !== id);
      localStorage.setItem("following", JSON.stringify(following));
    }
  }
  localStorage.setItem("blocked", JSON.stringify(blocked));
  renderFollowedAccounts();

  if (isBlocking) {
    document
      .querySelectorAll(`.ping[data-author="${id}"]`)
      .forEach((el) => el.remove());
  }

  if (profileView.style.display === "block") {
    const profileBlockBtn = profileInfo.querySelector(".btn-block");
    const profileFollowBtn = profileInfo.querySelector(".btn-follow");
    const profileCheck = profileInfo.querySelector(".follow-check");

    if (profileBlockBtn) {
      profileBlockBtn.classList.toggle("active", isBlocking);
      profileBlockBtn.innerHTML = `
        <i class="fa-solid fa-ban"></i>
        ${isBlocking ? "Unblock" : "Block"}
      `;
    }

    if (isBlocking) {
      if (profileFollowBtn) {
        profileFollowBtn.classList.remove("active");
        profileFollowBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Follow`;
      }
      if (profileCheck) profileCheck.style.display = "none";
      profileFeed.innerHTML =
        "<div style='padding: 1rem; color: var(--secondary-text);'>User is blocked.</div>";
    } else {
      showProfile(id);
    }
  }
}

function renderFollowedAccounts() {
  const container = document.getElementById("followed-accounts-list");
  if (!container) return;

  container.innerHTML = "";
  if (following.length === 0) {
    container.innerHTML = `<div style="padding: 0.5rem; color: var(--secondary-text); font-size: 0.9rem;">No followed accounts.</div>`;
    return;
  }

  following.forEach(async (id) => {
    const el = document.createElement("div");
    el.className = "followed-item";
    el.onclick = () => showProfile(id);

    const avatarUrl = `/api/avatar/${id}`;

    let name = "..." + id.slice(-8);
    const existingPing = document.querySelector(
      `.ping[data-author="${id}"] .author`
    );
    if (existingPing) name = existingPing.textContent;

    el.innerHTML = `
      <img src="${avatarUrl}" class="followed-avatar">
      <span class="followed-name">${escapeHtml(name)}</span>
    `;
    container.appendChild(el);
  });
}

async function getSwarmId(name) {
  if (!name) return 0;

  if (window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(name);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = new Uint8Array(hashBuffer);
      return (hashArray[0] % 255) + 1;
    } catch (e) {
      console.warn("Client-side crypto failed, falling back to API", e);
    }
  }

  try {
    const res = await fetch("/api/swarm/id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    return data.id;
  } catch (e) {
    console.error("Failed to get swarm ID", e);
    return 0;
  }
}

async function fetchTrending() {
  try {
    const res = await fetch("/api/trending");
    const topics = await res.json();
    console.log("Fetched trending topics:", topics);
    renderTrending(topics);
  } catch (e) {
    console.error("Failed to fetch trending topics", e);
  }
}

function renderTrending(topics) {
  const container = document.getElementById("trending-list");
  if (!container) return;

  container.innerHTML = "";

  if (topics.length === 0) {
    container.innerHTML = `<div style="padding: 0.5rem; color: var(--secondary-text); font-size: 0.9rem;">Nothing trending yet.</div>`;
    return;
  }

  topics.forEach((topic) => {
    const el = document.createElement("div");
    el.className = "trending-item";

    if (topic.isAll) {
      el.onclick = () => selectSwarm("");
    } else {
      el.onclick = () => joinSwarm(topic.name);
    }

    const displayName = topic.isAll ? "All" : `#${escapeHtml(topic.name)}`;

    el.innerHTML = `
      <span class="trending-name">${displayName}</span>
      <span class="trending-count">${topic.count} pings</span>
    `;

    container.appendChild(el);
  });
}

async function init() {
  initSections();

  try {
    const res = await fetch("/api/whoami");
    if (res.ok) {
      const data = await res.json();
      myId = data.id;
    }
  } catch (e) {
    console.error("Failed to fetch identity", e);
  }

  renderSwarmTags();

  for (const topic of joinedSwarms) {
    if (topic) {
      await fetch("/api/swarm/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: topic }),
      });
    }
  }

  try {
    const res = await fetch("/api/pings");
    const pings = await res.json();
    for (const ping of pings) {
      addPingToFeed(ping, false);
    }
  } catch (e) {
    console.error("Failed to fetch pings", e);
  }

  await fetchTrending();

  renderFollowedAccounts();

  const startSSE = () => {
    console.log("Initializing EventSource...");
    const evtSource = new EventSource("/events");

    evtSource.onerror = (err) => {
      console.error("EventSource connection lost. Attempting to reconnect...", err);
    };

    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "INIT") {
        myId = data.id;
        myIdEl.textContent = data.username || "..." + data.id.slice(-8);
        updateStats(data);
      } else if (data.type === "UPDATE") {
        updateStats(data);
      } else if (data.type === "PING") {
        addPingToFeed(data, true);
      } else if (data.count !== undefined) {
        updateStats(data);
      }
    };
  };

  if (document.readyState === "complete") {
    startSSE();
  } else {
    window.addEventListener("load", startSSE);
  }

  if (pingInput) {
    pingInput.addEventListener("input", () => {
      const currentLength = pingInput.value.length;
      charCount.textContent = `${currentLength}/280`;

      if (currentLength >= 280) {
        charCount.style.color = "var(--color-error)";
      } else if (currentLength >= 260) {
        charCount.style.color = "var(--color-warning)";
      } else {
        charCount.style.color = "var(--secondary-text)";
      }
    });
  }
}

async function joinSwarm(topic) {
  if (!topic) return;
  const normalized = topic.trim().toLowerCase();
  if (joinedSwarms.includes(normalized)) {
    selectSwarm(normalized);
    return;
  }

  try {
    const res = await fetch("/api/swarm/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: normalized }),
    });
    if (res.ok) {
      joinedSwarms.push(normalized);
      localStorage.setItem("joinedSwarms", JSON.stringify(joinedSwarms));
      renderSwarmTags();
      selectSwarm(normalized);
    }
  } catch (e) {
    console.error(e);
  }
}

async function leaveSwarm(topic) {
  if (!topic) return;
  const normalized = topic.trim().toLowerCase();
  try {
    await fetch("/api/swarm/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: normalized }),
    });
    joinedSwarms = joinedSwarms.filter((t) => t !== normalized);
    localStorage.setItem("joinedSwarms", JSON.stringify(joinedSwarms));
    if (currentTopic === normalized) {
      selectSwarm("");
    } else {
      renderSwarmTags();
    }
  } catch (e) {
    console.error(e);
  }
}

joinSwarmBtn.onclick = () => {
  const topic = swarmInput.value.trim();
  if (topic) {
    joinSwarm(topic);
    swarmInput.value = "";
  }
};

async function selectSwarm(topic) {
  const normalized = (topic || "").trim().toLowerCase();
  console.log(`[Swarm] Selecting topic: "${normalized}"`);
  currentTopic = normalized;

  if (!normalized) {
    currentSwarmId = 0;
  } else {
    currentSwarmId = await getSwarmId(normalized);
  }

  console.log(`[Swarm] Current Swarm ID set to: ${currentSwarmId}`);

  renderSwarmTags();
  updateFeedVisibility();
}

window.selectSwarm = selectSwarm;
function renderSwarmTags() {
  activeSwarmsEl.innerHTML = "";

  if (!joinedSwarms.includes("")) {
    joinedSwarms.unshift("");
  }

  joinedSwarms.forEach((topic) => {
    const container = document.createElement("div");
    container.className = `swarm-item ${
      topic === currentTopic ? "active" : ""
    }`;
    container.onclick = () => selectSwarm(topic);

    const label = document.createElement("span");
    label.className = "swarm-name";
    label.textContent = topic || "Global";

    container.appendChild(label);

    if (topic !== "") {
      const removeBtn = document.createElement("span");
      removeBtn.className = "swarm-remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        leaveSwarm(topic);
      };
      container.appendChild(removeBtn);
    }

    activeSwarmsEl.appendChild(container);
  });
}

function updateFeedVisibility() {
  const pings = feedEl.querySelectorAll(".ping");
  pings.forEach((el) => {
    const pingSwarmId = parseInt(el.dataset.swarmId || "0");
    if (currentSwarmId === 0 || pingSwarmId === currentSwarmId) {
      el.style.display = "";
    } else {
      el.style.display = "none";
    }
  });

  const profilePings = profileFeed.querySelectorAll(".ping");
  profilePings.forEach((el) => {
    const pingSwarmId = parseInt(el.dataset.swarmId || "0");
    if (currentSwarmId === 0 || pingSwarmId === currentSwarmId) {
      el.style.display = "";
    } else {
      el.style.display = "none";
    }
  });
}

function updateStats(data) {
  const count = data.count || 0;
  if (count > 1) {
    statusDot.className = "status-dot connected";
    statusText.textContent = "connected";
  } else {
    statusDot.className = "status-dot connecting";
    statusText.textContent = "connecting...";
  }
}

window.showFeed = () => {
  profileView.style.display = "none";
  feedEl.style.display = "block";
  composeArea.style.display = "block"; 
  swarmControls.style.display = "block";

  if (trendingTitle) {
    const titleText = trendingTitle.querySelector(".title-text");
    if (titleText) titleText.textContent = "Trending";
  }

  initSections();
  fetchTrending();
};

window.showProfile = async (id) => {
  profileView.style.display = "block";
  feedEl.style.display = "none";
  composeArea.style.display = "none";
  swarmControls.style.display = "none";

  profileInfo.innerHTML = "Loading...";
  profileFeed.innerHTML = "";

  try {
    const res = await fetch(`/api/profile/${id}`);
    const data = await res.json();

    const avatarUrl = `/api/avatar/${data.id}`;
    const isFollowing = following.includes(data.id);
    const isBlocked = blocked.includes(data.id);
    const isMe = data.id === myId;

    profileInfo.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <img src="${avatarUrl}" style="width: 64px; height: 64px; border-radius: 50%;">
                    <div>
                        <h2 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                            ${escapeHtml(data.username)}
                            <i class="fa-solid fa-circle-check follow-check" style="color: var(--color-success); font-size: 1rem; display: ${
                              isFollowing ? "inline" : "none"
                            };"></i>
                        </h2>
                        <div style="color: var(--secondary-text); font-size: 0.9rem;">${data.id.slice(
                          0,
                          16
                        )}...</div>
                    </div>
                </div>
                ${
                  !isMe
                    ? `
                <div class="profile-actions">
                    <button class="btn-follow ${
                      isFollowing ? "active" : ""
                    }" onclick="toggleFollow('${data.id}')">
                        <i class="fa-solid ${
                          isFollowing ? "fa-user-minus" : "fa-user-plus"
                        }"></i>
                        ${isFollowing ? "Unfollow" : "Follow"}
                    </button>
                    <button class="btn-block ${
                      isBlocked ? "active" : ""
                    }" onclick="toggleBlock('${data.id}')">
                        <i class="fa-solid fa-ban"></i>
                        ${isBlocked ? "Unblock" : "Block"}
                    </button>
                </div>
                `
                    : ""
                }
            </div>
        `;

    if (data.pings.length === 0) {
      profileFeed.innerHTML =
        "<div style='padding: 1rem; color: var(--secondary-text);'>No pings yet.</div>";
    } else {
      data.pings.forEach((ping) => {
        addPingToContainer(ping, profileFeed, false);
      });
    }

    const topicCounts = {};
    data.pings.forEach((p) => {
      if (p.topic) {
        topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
      }
    });

    const userTopics = Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    userTopics.unshift({ name: "All", count: data.pings.length, isAll: true });

    if (trendingTitle) {
      const titleText = trendingTitle.querySelector(".title-text");
      if (titleText) titleText.textContent = "User Swarms";
    }

    initSections();
    renderTrending(userTopics);
  } catch (e) {
    profileInfo.innerHTML = "Failed to load profile.";
    console.error(e);
  }
};

function addPingToFeed(ping, prepend = false) {
  addPingToContainer(ping, feedEl, prepend);
}

function addPingToContainer(ping, container, prepend = false) {
  if (blocked.includes(ping.author)) return;

  const isProfile = container === profileFeed;
  const domId = isProfile ? `profile-ping-${ping.id}` : `ping-${ping.id}`;

  const existingEl = document.getElementById(domId);

  const likes = ping.likes || 0;
  const amplifiedBy = ping.amplifiedBy || [];
  const comments = ping.comments || [];
  const commentCount = comments.length;

  const isAmplifiedByMe =
    Array.isArray(amplifiedBy) && amplifiedBy.includes(myId);
  const isMe = ping.author === myId;
  const swarmId = ping.swarmId || 0;

  const icon = `<i class="fa-solid fa-bullhorn"></i>`;

  const buttonContent = `
    ${icon}
    <span class="count">${likes > 0 ? likes : ""}</span>
  `;

  if (existingEl) {
    const btn = existingEl.querySelector(
      ".ping-actions button.action-btn:first-child"
    );
    if (btn) {
      btn.innerHTML = buttonContent;
      if (isAmplifiedByMe) {
        btn.classList.add("amplified");
        btn.disabled = true;
      } else if (isMe) {
        btn.disabled = true;
      }
    }

    const commentsSection = existingEl.querySelector(".comments-section");
    if (commentsSection) {
      renderComments(commentsSection, comments);
    }
    const commentCountEl = existingEl.querySelector(".comment-btn .count");
    if (commentCountEl) {
      commentCountEl.textContent = commentCount > 0 ? commentCount : "";
    }

    return;
  }

  const el = document.createElement("div");
  el.className = "ping";
  el.id = domId;
  el.dataset.swarmId = swarmId;
  el.dataset.author = ping.author;

  if (!isProfile && currentSwarmId !== 0 && swarmId !== currentSwarmId) {
    el.style.display = "none";
  }

  const date = new Date(ping.timestamp).toLocaleString();
  const authorName = ping.username || "..." + ping.author.slice(-8);
  const avatarUrl = `/api/avatar/${ping.author}`;
  const isFollowing = following.includes(ping.author);

  let topicPill = "";
  if (ping.topic) {
    topicPill = `<span class="topic-pill" onclick="event.stopPropagation(); joinSwarm('${escapeHtml(
      ping.topic
    )}')">#${escapeHtml(ping.topic)}</span>`;
  }

  const avatarOnClick = isProfile
    ? ""
    : `onclick="showProfile('${ping.author}')"`;
  const avatarStyle = isProfile ? "" : 'style="cursor: pointer;"';
  const authorOnClick = isProfile
    ? ""
    : `onclick="showProfile('${ping.author}')"`;
  const authorStyle = isProfile ? "" : 'style="cursor: pointer;"';

  el.innerHTML = `
        <div class="avatar" ${avatarOnClick} ${avatarStyle}>
            <img src="${avatarUrl}" alt="${authorName}" loading="lazy">
        </div>
        <div class="ping-body">
            <div class="ping-header">
                <div style="display: flex; align-items: center; gap: 0.3rem; flex: 1; min-width: 0;">
                    <span class="author" title="${
                      ping.author
                    }" ${authorOnClick} ${authorStyle}>${escapeHtml(
    authorName
  )}</span>
                    <i class="fa-solid fa-circle-check follow-check" style="color: var(--color-success); font-size: 0.8rem; display: ${
                      isFollowing ? "inline" : "none"
                    };"></i>
                    ${topicPill}
                    <span class="date">${date}</span>
                </div>
                ${
                  !isMe
                    ? `
                <div class="ping-menu-container">
                    <button class="ping-menu-btn" onclick="event.stopPropagation(); togglePingMenu('${domId}')">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <div class="ping-menu" id="menu-${domId}" style="display: none;">
                        <div class="menu-item" onclick="event.stopPropagation(); toggleFollow('${
                          ping.author
                        }')">
                            <i class="fa-solid ${
                              isFollowing ? "fa-user-minus" : "fa-user-plus"
                            }"></i>
                            <span>${isFollowing ? "Unfollow" : "Follow"}</span>
                        </div>
                        <div class="menu-item delete" onclick="event.stopPropagation(); toggleBlock('${
                          ping.author
                        }')">
                            <i class="fa-solid fa-ban"></i>
                            <span>Block</span>
                        </div>
                    </div>
                </div>
                `
                    : ""
                }
            </div>
            <div class="ping-content">${escapeHtml(ping.content)}</div>
            <div class="ping-actions">
                <button class="action-btn ${
                  isAmplifiedByMe ? "amplified" : ""
                }" 
                        onclick="amplify('${ping.id}')" 
                        ${isMe || isAmplifiedByMe ? "disabled" : ""}>
                    ${buttonContent}
                </button>
                <button class="action-btn comment-btn" onclick="toggleComments('${domId}')">
                    <i class="fa-regular fa-comment"></i>
                    <span class="count">${
                      commentCount > 0 ? commentCount : ""
                    }</span>
                </button>
            </div>
            <div class="comments-section" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-area">
                    <input type="text" placeholder="Write a comment..." class="comment-input">
                    <button onclick="postComment('${
                      ping.id
                    }', this)">Reply</button>
                </div>
            </div>
        </div>
    `;

  renderComments(el.querySelector(".comments-section"), comments);

  if (prepend) {
    container.insertBefore(el, container.firstChild);
  } else {
    container.appendChild(el);
  }
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.amplify = async (id) => {
  try {
    const res = await fetch("/api/amplify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      const data = await res.json();
      updatePingButton(`ping-${id}`, data.likes);
      updatePingButton(`profile-ping-${id}`, data.likes);
    } else {
      const err = await res.json();
      alert(err.error || "Failed to amplify");
    }
  } catch (e) {
    console.error(e);
  }
};

function updatePingButton(domId, likes) {
  const btn = document.querySelector(`#${domId} .ping-actions button`);
  if (btn) {
    const icon = `<i class="fa-solid fa-bullhorn"></i>`;
    btn.innerHTML = `
            ${icon}
            <span class="count">${likes}</span>
        `;
    btn.classList.add("amplified");
    btn.disabled = true;
  }
}

pingBtn.onclick = async () => {
  const content = pingInput.value.trim();
  if (!content) return;

  try {
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        topic: currentTopic,
      }),
    });

    if (res.ok) {
      pingInput.value = "";
      charCount.textContent = "0/280";
      charCount.style.color = "var(--secondary-text)";
    } else {
      alert("Failed to post ping");
    }
  } catch (e) {
    console.error(e);
  }
};

window.togglePingMenu = (domId) => {
  const menu = document.getElementById(`menu-${domId}`);
  if (!menu) return;

  document.querySelectorAll(".ping-menu").forEach((m) => {
    if (m.id !== `menu-${domId}`) m.style.display = "none";
  });

  menu.style.display = menu.style.display === "none" ? "block" : "none";
};

document.addEventListener("click", () => {
  document.querySelectorAll(".ping-menu").forEach((m) => {
    m.style.display = "none";
  });
});

window.toggleComments = (domId) => {
  const el = document.getElementById(domId);
  if (!el) return;
  const section = el.querySelector(".comments-section");
  if (section) {
    section.style.display = section.style.display === "none" ? "block" : "none";
  }
};

window.postComment = async (pingId, btn) => {
  const input = btn.previousElementSibling;
  const content = input.value.trim();
  if (!content) return;

  try {
    const res = await fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pingId, content }),
    });

    if (res.ok) {
      input.value = "";
    } else {
      alert("Failed to post comment");
    }
  } catch (e) {
    console.error(e);
  }
};

function renderComments(container, comments) {
  const list = container.querySelector(".comments-list");
  if (!list) return;

  list.innerHTML = "";

  comments.forEach((c) => {
    const div = document.createElement("div");
    div.className = "comment";
    const date = new Date(c.timestamp).toLocaleString();
    const authorName = c.username || "..." + c.author.slice(-8);
    const avatarUrl = `/api/avatar/${c.author}`;

    div.innerHTML = `
        <div class="comment-avatar" onclick="showProfile('${c.author}')">
            <img src="${avatarUrl}" alt="${authorName}" loading="lazy">
        </div>
        <div class="comment-body">
            <div class="comment-header">
                <span class="comment-author" onclick="showProfile('${
                  c.author
                }')">${escapeHtml(authorName)}</span>
                <span class="comment-date">${date}</span>
            </div>
            <div class="comment-content">${escapeHtml(c.content)}</div>
        </div>
    `;
    list.appendChild(div);
  });
}

init();
