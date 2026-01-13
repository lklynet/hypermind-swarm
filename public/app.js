const feed = document.getElementById("feed");
const pingInput = document.getElementById("ping-input");
const pingBtn = document.getElementById("ping-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const charCount = document.getElementById("char-count");


const myAvatarSmall = document.getElementById("my-avatar-small");
const myNameDisplay = document.getElementById("my-name-display");
const myIdDisplay = document.getElementById("my-id");


const swarmInput = document.getElementById("swarm-input");
const joinSwarmBtn = document.getElementById("join-swarm-btn");
const activeSwarmsEl = document.getElementById("active-swarms");
const trendingList = document.getElementById("trending-list");


const mainView = document.getElementById("main-view");
const profileView = document.getElementById("profile-view");
const profileInfo = document.getElementById("profile-info");
const profileFeed = document.getElementById("profile-feed");
const feedEl = document.getElementById("feed");


let myId = "";
let currentTopic = "";
let currentSwarmId = 0;
let currentTab = "foryou"; 
let joinedSwarms = JSON.parse(localStorage.getItem("joinedSwarms") || '[""]');
let following = JSON.parse(localStorage.getItem("following") || "[]");
let blocked = JSON.parse(localStorage.getItem("blocked") || "[]");


function switchTab(tab) {
  currentTab = tab;
  
  
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  
  updateFeedVisibility();
}


async function init() {
  try {
    const res = await fetch("/api/whoami");
    if (res.ok) {
      const data = await res.json();
      myId = data.id;
      updateMyProfileWidget(data);
    }
  } catch (e) {
    console.error("Failed to fetch identity", e);
  }

  renderSwarmTags();
  renderFollowedAccounts();
  
  
  if (pingInput) {
    pingInput.placeholder = "What is happening in Global?!";
  }

  
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
  
  
  const startSSE = () => {
    console.log("Initializing EventSource...");
    const evtSource = new EventSource("/events");

    evtSource.onerror = (err) => {
      console.error("EventSource connection lost.", err);
    };

    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "INIT") {
        myId = data.id;
        updateMyProfileWidget(data);
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
      charCount.style.display = currentLength > 0 ? 'inline' : 'none';
      charCount.textContent = `${currentLength}/280`;

      if (currentLength >= 280) {
        charCount.style.color = "var(--color-red)";
      } else if (currentLength >= 260) {
        charCount.style.color = "var(--color-gold)";
      } else {
        charCount.style.color = "var(--primary-color)";
      }
    });
  }
  
  
  const composeAvatar = document.getElementById('compose-avatar');
  if (composeAvatar && myId) {
      composeAvatar.style.backgroundImage = `url(/api/avatar/${myId})`;
      composeAvatar.style.backgroundSize = 'cover';
      composeAvatar.style.backgroundColor = getColorFromId(myId);
  }
}

function updateMyProfileWidget(data) {
    if (myNameDisplay) myNameDisplay.textContent = data.username || "Anonymous";
    if (myIdDisplay) myIdDisplay.textContent = "@" + data.id.slice(-8);
    if (myAvatarSmall) {
        myAvatarSmall.style.backgroundImage = `url(/api/avatar/${data.id})`;
        myAvatarSmall.style.backgroundSize = 'cover';
        myAvatarSmall.style.backgroundColor = getColorFromId(data.id + "pfp");
    }
    
    const composeAvatar = document.getElementById('compose-avatar');
    if (composeAvatar) {
        composeAvatar.style.backgroundImage = `url(/api/avatar/${data.id})`;
        composeAvatar.style.backgroundSize = 'cover';
        composeAvatar.style.backgroundColor = getColorFromId(data.id + "pfp");
    }
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
      console.warn("Client-side crypto failed", e);
    }
  }
  return 0; 
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

if (joinSwarmBtn) {
    joinSwarmBtn.onclick = () => {
    const topic = swarmInput.value.trim();
    if (topic) {
        joinSwarm(topic);
        swarmInput.value = "";
    }
    };
}

async function selectSwarm(topic) {
  const normalized = (topic || "").trim().toLowerCase();
  currentTopic = normalized;

  if (!normalized) {
    currentSwarmId = 0;
    pingInput.placeholder = "What is happening in Global?!";
  } else {
    currentSwarmId = await getSwarmId(normalized);
    pingInput.placeholder = `Ping #${normalized}...`;
  }

  renderSwarmTags();
  updateFeedVisibility();
}

function renderSwarmTags() {
  if (!activeSwarmsEl) return;
  activeSwarmsEl.innerHTML = "";

  if (!joinedSwarms.includes("")) {
    joinedSwarms.unshift("");
  }

  joinedSwarms.forEach((topic) => {
    const container = document.createElement("div");
    container.className = `swarm-item ${topic === currentTopic ? "active" : ""}`;
    container.style.display = 'flex';
    container.style.justifyContent = 'space-between';
    container.style.alignItems = 'center';
    container.style.padding = '0.5rem';
    container.style.cursor = 'pointer';
    container.style.borderRadius = '4px';
    if (topic === currentTopic) {
        container.style.backgroundColor = 'var(--hover-bg)';
        container.style.color = 'var(--primary-color)';
    }
    
    container.onclick = () => selectSwarm(topic);

    const label = document.createElement("span");
    label.textContent = topic || "Global";
    container.appendChild(label);

    if (topic !== "") {
      const removeBtn = document.createElement("span");
      removeBtn.className = 'swarm-remove-btn';
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
    const authorId = el.dataset.author;
    
    let visible = true;

    
    if (currentSwarmId !== 0 && pingSwarmId !== currentSwarmId) {
      visible = false;
    }
    
    
    if (currentTab === 'following') {
        if (!following.includes(authorId) && authorId !== myId) {
            visible = false;
        }
    }

    el.style.display = visible ? "flex" : "none";
  });
}

function addPingToFeed(ping, prepend = false) {
  addPingToContainer(ping, feedEl, prepend);
}

function addPingToContainer(ping, container, prepend = false) {
  if (blocked.includes(ping.author)) return;

  const isProfile = container === profileFeed;
  const domId = isProfile ? `profile-ping-${ping.id}` : `ping-${ping.id}`;
  const existingEl = document.getElementById(domId);

  const likes = ping.likes || 0;
  const isMe = ping.author === myId;
  const swarmId = ping.swarmId || 0;

  
  if (existingEl) {
    
    return;
  }

  const el = document.createElement("div");
  el.className = "ping";
  el.id = domId;
  el.dataset.swarmId = swarmId;
  el.dataset.author = ping.author;

  
  if (!isProfile) {
      if (currentSwarmId !== 0 && swarmId !== currentSwarmId) {
          el.style.display = "none";
      }
      if (currentTab === 'following' && !following.includes(ping.author) && !isMe) {
          el.style.display = "none";
      }
  }

  const date = new Date(ping.timestamp).toLocaleString();
  const authorName = ping.username || "Anonymous";
  const avatarUrl = `/api/avatar/${ping.author}`;
  const isFollowing = following.includes(ping.author);

  let topicPill = "";
  if (ping.topic) {
    topicPill = `<span style="color: var(--primary-color); cursor: pointer;" onclick="event.stopPropagation(); joinSwarm('${escapeHtml(ping.topic)}')">#${escapeHtml(ping.topic)}</span>`;
  }

  el.innerHTML = `
    <div class="ping-avatar" style="background-image: url('${avatarUrl}'); background-size: cover; background-color: ${getColorFromId(ping.author)};" onclick="showProfile('${ping.author}')"></div>
    <div class="ping-content">
        <div class="ping-header">
            <span class="ping-author" onclick="showProfile('${ping.author}')" style="cursor: pointer;">${escapeHtml(authorName)}</span>
            <span class="ping-handle">@${ping.author.slice(-8)}</span>
            <span class="ping-time">· ${timeSince(new Date(ping.timestamp))}</span>
            ${topicPill ? `<span style="margin-left: auto; font-size: 0.8rem;">${topicPill}</span>` : ''}
        </div>
        <div class="ping-text">${escapeHtml(ping.content)}</div>
        <div class="ping-actions">
            <button class="action-btn amplify" onclick="amplifyPing('${ping.id}')">
                <i class="fa-solid fa-bullhorn"></i> <span id="amplify-count-${ping.id}">${ping.likes || 0}</span>
            </button>
            <button class="action-btn comment" onclick="toggleComment('${ping.id}')">
                <i class="fa-regular fa-comment"></i> <span id="comment-count-${ping.id}">${ping.comments ? ping.comments.length : 0}</span>
            </button>
        </div>
        <div id="comment-section-${ping.id}" class="comment-section" style="display: none;">
            <div class="comment-input-wrapper">
                <input type="text" id="comment-input-${ping.id}" placeholder="Write a comment..." onkeydown="handleCommentKey(event, '${ping.id}')">
                <button onclick="submitComment('${ping.id}')">Reply</button>
            </div>
            <div id="comments-list-${ping.id}" class="comments-list">
                ${(ping.comments || []).map(c => renderComment(c)).join('')}
            </div>
        </div>
    </div>
  `;

  if (prepend) {
    container.prepend(el);
  } else {
    container.appendChild(el);
  }
}



async function ping() {
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
      charCount.style.display = 'none';
    }
  } catch (e) {
    console.error(e);
  }
}

if (pingBtn) {
    pingBtn.onclick = ping;
}

async function amplifyPing(id) {
    try {
        const res = await fetch("/api/amplify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        if (res.ok) {
            const data = await res.json();
            const countEl = document.getElementById(`amplify-count-${id}`);
            if (countEl) countEl.textContent = data.likes;
        } else {
            const err = await res.json();
            alert(err.error || "Failed to amplify");
        }
    } catch (e) {
        console.error(e);
    }
}

function toggleComment(id) {
    const section = document.getElementById(`comment-section-${id}`);
    if (section) {
        const isHidden = section.style.display === "none";
        section.style.display = isHidden ? "block" : "none";
        if (isHidden) {
            const input = document.getElementById(`comment-input-${id}`);
            if (input) input.focus();
        }
    }
}

function handleCommentKey(e, id) {
    if (e.key === "Enter") {
        submitComment(id);
    }
}

async function submitComment(id) {
    const input = document.getElementById(`comment-input-${id}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    try {
        const res = await fetch("/api/comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pingId: id, content }),
        });
        if (res.ok) {
            const comment = await res.json();
            input.value = "";
            
            
            const list = document.getElementById(`comments-list-${id}`);
            if (list) {
                const el = document.createElement("div");
                el.innerHTML = renderComment(comment); 
                
                list.insertAdjacentHTML('beforeend', renderComment(comment));
            }
            
            
            const countEl = document.getElementById(`comment-count-${id}`);
            if (countEl) {
                countEl.textContent = parseInt(countEl.textContent || "0") + 1;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

function renderComment(c) {
    const avatarUrl = `/api/avatar/${c.author}`;
    return `
        <div class="comment-item">
            <div class="comment-avatar" style="background-image: url('${avatarUrl}'); background-size: cover; background-color: ${getColorFromId(c.author)}; cursor: pointer;" onclick="showProfile('${c.author}')"></div>
            <div class="comment-content">
                <div>
                    <span class="comment-author" style="cursor: pointer;" onclick="showProfile('${c.author}')">${escapeHtml(c.username || "Anonymous")}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">${timeSince(new Date(c.timestamp))}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>
        </div>
    `;
}



window.showMyProfile = () => {
    if (myId) showProfile(myId);
};

window.showProfile = async (id) => {
  mainView.style.display = "none";
  profileView.style.display = "block";
  
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
        <div class="profile-cover" style="background-color: ${getColorFromId(data.id + "banner")};"></div>
        <div class="profile-details">
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div class="profile-avatar-large" style="background-image: url('${avatarUrl}'); background-size: cover; background-color: ${getColorFromId(data.id + "pfp")};"></div>
                ${!isMe ? `
                    <button class="ping-btn-large" style="width: auto; padding: 0.5rem 1.5rem; margin: 0;" onclick="toggleFollow('${data.id}')">
                        ${isFollowing ? 'Unfollow' : 'Follow'}
                    </button>
                ` : ''}
            </div>
            <div>
                <div class="profile-name-large">${escapeHtml(data.username)}</div>
                <div class="profile-handle-large">@${data.id.slice(-8)}</div>
            </div>
            <div class="profile-stats">
                <span><span class="stat-value">${data.pings.length}</span> Pings</span>
            </div>
        </div>
    `;

    if (data.pings.length === 0) {
      profileFeed.innerHTML = "<div style='padding: 2rem; text-align: center; color: var(--text-muted);'>No pings yet.</div>";
    } else {
      data.pings.forEach((ping) => {
        addPingToContainer(ping, profileFeed, false);
      });
    }

  } catch (e) {
    profileInfo.innerHTML = "Failed to load profile.";
    console.error(e);
  }
};

window.showFeed = () => {
  profileView.style.display = "none";
  mainView.style.display = "block";
};

function toggleFollow(id) {
  const isFollowing = !following.includes(id);
  if (following.includes(id)) {
    following = following.filter((f) => f !== id);
  } else {
    following.push(id);
  }
  localStorage.setItem("following", JSON.stringify(following));
  
  renderFollowedAccounts();
  
  
  if (profileView.style.display === 'block') {
      showProfile(id);
  }
  
  
  if (currentTab === 'following') {
      updateFeedVisibility();
  }
}

function renderFollowedAccounts() {
  const container = document.getElementById("followed-accounts-list");
  if (!container) return;

  container.innerHTML = "";
  if (following.length === 0) {
    container.innerHTML = `<div style="padding: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">No followed accounts.</div>`;
    return;
  }

  following.forEach(async (id) => {
    const el = document.createElement("div");
    el.className = "followed-item";
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '0.75rem';
    el.style.padding = '0.5rem';
    el.style.cursor = 'pointer';
    el.style.borderRadius = '8px';
    el.style.transition = 'background-color 0.2s';
    
    el.onmouseover = () => { el.style.backgroundColor = 'var(--hover-bg)'; };
    el.onmouseout = () => { el.style.backgroundColor = 'transparent'; };
    el.onclick = () => showProfile(id);

    const avatarUrl = `/api/avatar/${id}`;
    let name = "..." + id.slice(-8);

    el.innerHTML = `
      <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; background-color: ${getColorFromId(id + "pfp")};">
      <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(name)}</span>
    `;
    container.appendChild(el);
  });
}



async function fetchTrending() {
  try {
    const res = await fetch("/api/trending");
    const topics = await res.json();
    renderTrending(topics);
  } catch (e) {
    console.error("Failed to fetch trending topics", e);
  }
}

function renderTrending(topics) {
  if (!trendingList) return;
  trendingList.innerHTML = "";

  if (topics.length === 0) {
    trendingList.innerHTML = `<div style="padding: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Nothing trending yet.</div>`;
    return;
  }

  topics.forEach((topic) => {
    const el = document.createElement("div");
    el.className = "trend-item";
    el.onclick = () => {
        if (topic.isAll) selectSwarm("");
        else joinSwarm(topic.name);
    };

    const displayName = topic.isAll ? "Global" : `#${escapeHtml(topic.name)}`;

    el.innerHTML = `
      <span class="trend-name">${displayName}</span>
      <div class="trend-meta">${topic.count} pings</div>
    `;

    trendingList.appendChild(el);
  });
}



const PALETTE = [
  "var(--color-red)",
  "var(--color-olive)",
  "var(--color-gold)",
  "var(--color-blue)",
  "var(--color-purple)",
  "var(--color-green)",
  "var(--color-beige)"
];

function getColorFromId(id) {
  if (!id) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;

  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return Math.floor(seconds) + "s";
}

function updateStats(data) {
  if (statusDot && statusText) {
      const count = data.count || 0;
      if (count > 1) {
        statusDot.className = "status-dot connected";
        statusText.textContent = "connected";
      } else {
        statusDot.className = "status-dot connecting";
        statusText.textContent = "connecting...";
      }
  }
  
  const nodeCountEl = document.getElementById("stat-node-count");
  if (nodeCountEl) {
      nodeCountEl.textContent = data.count || 0;
  }
}

function focusInput() {
    if (pingInput) pingInput.focus();
}


init();
