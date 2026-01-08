const feed = document.getElementById("feed");
const pingInput = document.getElementById("ping-input");
const pingBtn = document.getElementById("ping-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const myIdEl = document.getElementById("my-id");
const charCount = document.getElementById("char-count");

let myId = "";

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

  // 2. Load initial pings
  try {
    const res = await fetch("/api/pings");
    const pings = await res.json();
    pings.forEach((ping) => addPingToFeed(ping, false));
  } catch (e) {
    console.error("Failed to fetch pings", e);
  }

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

function addPingToFeed(ping, prepend = false) {
  const existingEl = document.getElementById(`ping-${ping.id}`);

  const likes = ping.likes || 0;
  const amplifiedBy = ping.amplifiedBy || [];
  const isAmplifiedByMe =
    Array.isArray(amplifiedBy) && amplifiedBy.includes(myId);
  const isMe = ping.author === myId;

  // Icon: Font Awesome Bullhorn
  const icon = `<i class="fa-solid fa-bullhorn"></i>`;

  const buttonContent = `
    ${icon}
    <span class="count">${likes > 0 ? likes : ""}</span>
  `;

  if (existingEl) {
    const btn = existingEl.querySelector(".ping-actions button");
    if (btn) {
      btn.innerHTML = buttonContent;
      if (isAmplifiedByMe) {
        btn.classList.add("amplified");
        btn.disabled = true; // Still disable to prevent double click, but style via class
      } else if (isMe) {
        btn.disabled = true;
      }
    }
    return;
  }

  const el = document.createElement("div");
  el.className = "ping";
  el.id = `ping-${ping.id}`;

  const date = new Date(ping.timestamp).toLocaleString();
  const authorName = ping.username || "..." + ping.author.slice(-8);
  const avatarUrl = `/api/avatar/${ping.author}`;

  el.innerHTML = `
        <div class="avatar">
            <img src="${avatarUrl}" alt="${authorName}" loading="lazy">
        </div>
        <div class="ping-body">
            <div class="ping-header">
                <span class="author" title="${ping.author}">${escapeHtml(
    authorName
  )}</span>
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
            </div>
        </div>
    `;

  if (prepend) {
    feed.insertBefore(el, feed.firstChild);
  } else {
    feed.appendChild(el);
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
      const btn = document.querySelector(`#ping-${id} .ping-actions button`);
      if (btn) {
        // Icon: Font Awesome Bullhorn (reused)
        const icon = `<i class="fa-solid fa-bullhorn"></i>`;

        btn.innerHTML = `
            ${icon}
            <span class="count">${data.likes}</span>
        `;
        btn.classList.add("amplified");
        btn.disabled = true;
      }
    } else {
      const err = await res.json();
      alert(err.error || "Failed to amplify");
    }
  } catch (e) {
    console.error(e);
  }
};

pingBtn.onclick = async () => {
  const content = pingInput.value.trim();
  if (!content) return;

  try {
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      pingInput.value = "";
    } else {
      alert("Failed to post ping");
    }
  } catch (e) {
    console.error(e);
  }
};

init();
