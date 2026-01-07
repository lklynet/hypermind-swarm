const feed = document.getElementById("feed");
const tweetInput = document.getElementById("tweet-input");
const tweetBtn = document.getElementById("tweet-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const myIdEl = document.getElementById("my-id");

let myId = "";

async function init() {
  // Load initial tweets
  try {
    const res = await fetch("/api/tweets");
    const tweets = await res.json();
    tweets.forEach((tweet) => addTweetToFeed(tweet, false));
  } catch (e) {
    console.error("Failed to fetch tweets", e);
  }

  // Setup SSE
  const evtSource = new EventSource("/events");

  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "INIT") {
      updateStats(data);
      myId = data.id;
      myIdEl.textContent = data.username || "..." + myId.slice(-8);
    } else if (data.type === "TWEET") {
      addTweetToFeed(data, true); // true = prepend
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

function addTweetToFeed(tweet, prepend = false) {
  const existingEl = document.getElementById(`tweet-${tweet.id}`);

  const likes = tweet.likes || 0;
  const amplifiedBy = tweet.amplifiedBy || [];
  const isAmplifiedByMe =
    Array.isArray(amplifiedBy) && amplifiedBy.includes(myId);
  const isMe = tweet.author === myId;

  // Icon: Font Awesome Bullhorn
  const icon = `<i class="fa-solid fa-bullhorn"></i>`;

  const buttonContent = `
    ${icon}
    <span class="count">${likes > 0 ? likes : ""}</span>
  `;

  if (existingEl) {
    const btn = existingEl.querySelector(".tweet-actions button");
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
  el.className = "tweet";
  el.id = `tweet-${tweet.id}`;

  const date = new Date(tweet.timestamp).toLocaleString();
  const authorName = tweet.username || "..." + tweet.author.slice(-8);
  const avatarUrl = `/api/avatar/${tweet.author}`;

  el.innerHTML = `
        <div class="avatar">
            <img src="${avatarUrl}" alt="${authorName}" loading="lazy">
        </div>
        <div class="tweet-body">
            <div class="tweet-header">
                <span class="author" title="${tweet.author}">${escapeHtml(
    authorName
  )}</span>
                <span class="date">${date}</span>
            </div>
            <div class="tweet-content">${escapeHtml(tweet.content)}</div>
            <div class="tweet-actions">
                <button class="action-btn ${
                  isAmplifiedByMe ? "amplified" : ""
                }" 
                        onclick="amplify('${tweet.id}')" 
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
      const btn = document.querySelector(`#tweet-${id} .tweet-actions button`);
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

tweetBtn.onclick = async () => {
  const content = tweetInput.value.trim();
  if (!content) return;

  try {
    const res = await fetch("/api/tweet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      tweetInput.value = "";
    } else {
      alert("Failed to post tweet");
    }
  } catch (e) {
    console.error(e);
  }
};

init();
