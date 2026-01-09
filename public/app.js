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

// Profile View Elements
const profileView = document.getElementById("profile-view");
const profileInfo = document.getElementById("profile-info");
const profileFeed = document.getElementById("profile-feed");
const feedEl = document.getElementById("feed"); // same as feed
const composeArea = document.querySelector(".compose-area"); // Main compose area
const swarmControls = document.querySelector(".swarm-controls");

let myId = "";
let currentTopic = ""; // "" = Global
let currentSwarmId = 0;
let joinedSwarms = JSON.parse(localStorage.getItem("joinedSwarms") || '[""]');

async function getSwarmId(name) {
  if (!name) return 0;
  
  // Try client-side calculation first (faster, no network)
  if (window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(name);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
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

  topics.forEach(topic => {
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
  // 1. Get identity first
  try {
    const res = await fetch("/api/whoami");
    if (res.ok) {
      const data = await res.json();
      myId = data.id;
    }
  } catch (e) {
    console.error("Failed to fetch identity", e);
  }

  // Restore subscriptions
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

  // 2. Load initial pings
  try {
    const res = await fetch("/api/pings");
    const pings = await res.json();
    for (const ping of pings) {
      addPingToFeed(ping, false);
    }
  } catch (e) {
    console.error("Failed to fetch pings", e);
  }

  // 3. Load Trending
  fetchTrending();

  // Setup SSE
  const evtSource = new EventSource("/events");

  // Character counter
  pingInput.addEventListener("input", () => {
    const currentLength = pingInput.value.length;
    charCount.textContent = `${currentLength}/280`;

    if (currentLength >= 280) {
      charCount.style.color = "#ef4444"; // red-500
    } else if (currentLength >= 260) {
      charCount.style.color = "#f59e0b"; // amber-500
    } else {
      charCount.style.color = "var(--secondary-text)";
    }
  });

  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "INIT") {
      updateStats(data);
      myId = data.id;
      myIdEl.textContent = data.username || "..." + myId.slice(-8);
    } else if (data.type === "PING") {
      addPingToFeed(data, true); // true = prepend
    } else if (data.count !== undefined) {
      // Stat update
      updateStats(data);
    }
  };
}

async function joinSwarm(topic) {
  if (!topic) return;
  if (joinedSwarms.includes(topic)) {
    selectSwarm(topic);
    return;
  }

  try {
    const res = await fetch("/api/swarm/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: topic }),
    });
    if (res.ok) {
      joinedSwarms.push(topic);
      localStorage.setItem("joinedSwarms", JSON.stringify(joinedSwarms));
      renderSwarmTags();
      selectSwarm(topic);
    }
  } catch (e) {
    console.error(e);
  }
}

async function leaveSwarm(topic) {
  if (!topic) return;
  try {
    await fetch("/api/swarm/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: topic }),
    });
    joinedSwarms = joinedSwarms.filter((t) => t !== topic);
    localStorage.setItem("joinedSwarms", JSON.stringify(joinedSwarms));
    if (currentTopic === topic) {
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
  console.log(`[Swarm] Selecting topic: "${topic}"`);
  currentTopic = topic;
  
  if (!topic) {
    currentSwarmId = 0;
  } else {
    currentSwarmId = await getSwarmId(topic);
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
    container.className = `swarm-item ${topic === currentTopic ? "active" : ""}`;
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
  composeArea.style.display = "block"; // Only main compose area
  swarmControls.style.display = "block";

  if (trendingTitle) trendingTitle.textContent = "Trending";
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
    profileInfo.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <img src="${avatarUrl}" style="width: 64px; height: 64px; border-radius: 50%;">
                <div>
                    <h2 style="margin: 0;">${escapeHtml(data.username)}</h2>
                    <div style="color: var(--secondary-text); font-size: 0.9rem;">${data.id.slice(
                      0,
                      16
                    )}...</div>
                </div>
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

    // Calculate user's top topics
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

    // Add "All" option
    userTopics.unshift({ name: "All", count: data.pings.length, isAll: true });

    if (trendingTitle) trendingTitle.textContent = "User Swarms";
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

  // Icon: Font Awesome Bullhorn
  const icon = `<i class="fa-solid fa-bullhorn"></i>`;

  const buttonContent = `
    ${icon}
    <span class="count">${likes > 0 ? likes : ""}</span>
  `;

  if (existingEl) {
    const btn = existingEl.querySelector(".ping-actions button.action-btn:first-child");
    if (btn) {
      btn.innerHTML = buttonContent;
      if (isAmplifiedByMe) {
        btn.classList.add("amplified");
        btn.disabled = true;
      } else if (isMe) {
        btn.disabled = true;
      }
    }

    // Update comments
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

  // Initial visibility check (Only for main feed)
  if (!isProfile && currentSwarmId !== 0 && swarmId !== currentSwarmId) {
    el.style.display = "none";
  }

  const date = new Date(ping.timestamp).toLocaleString();
  const authorName = ping.username || "..." + ping.author.slice(-8);
  const avatarUrl = `/api/avatar/${ping.author}`;

  let topicPill = "";
  if (ping.topic) {
    topicPill = `<span class="topic-pill" onclick="event.stopPropagation(); joinSwarm('${escapeHtml(
      ping.topic
    )}')">#${escapeHtml(ping.topic)}</span>`;
  }

  const avatarOnClick = isProfile ? "" : `onclick="showProfile('${ping.author}')"`;
  const avatarStyle = isProfile ? "" : 'style="cursor: pointer;"';
  const authorOnClick = isProfile ? "" : `onclick="showProfile('${ping.author}')"`;
  const authorStyle = isProfile ? "" : 'style="cursor: pointer;"';

  el.innerHTML = `
        <div class="avatar" ${avatarOnClick} ${avatarStyle}>
            <img src="${avatarUrl}" alt="${authorName}" loading="lazy">
        </div>
        <div class="ping-body">
            <div class="ping-header">
                <span class="author" title="${
                  ping.author
                }" ${authorOnClick} ${authorStyle}>${escapeHtml(authorName)}</span>
                ${topicPill}
                <span class="date">${date}</span>
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
                    <span class="count">${commentCount > 0 ? commentCount : ""}</span>
                </button>
            </div>
            <div class="comments-section" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-area">
                    <input type="text" placeholder="Write a comment..." class="comment-input">
                    <button onclick="postComment('${ping.id}', this)">Post</button>
                </div>
            </div>
        </div>
    `;

  // Initial render of comments
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
      // Update both feed and profile feed if present
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
  
  // Simple re-render
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
                <span class="comment-author" onclick="showProfile('${c.author}')">${escapeHtml(authorName)}</span>
                <span class="comment-date">${date}</span>
            </div>
            <div class="comment-content">${escapeHtml(c.content)}</div>
        </div>
    `;
    list.appendChild(div);
  });
}

init();
