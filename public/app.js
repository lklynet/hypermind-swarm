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
  // Deduplicate in UI if needed (though store handles backend)
  if (document.getElementById(`tweet-${tweet.id}`)) return;

  const el = document.createElement("div");
  el.className = "tweet";
  el.id = `tweet-${tweet.id}`;

  const date = new Date(tweet.timestamp).toLocaleString();
  const isMe = tweet.author === myId;
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
                <button onclick="amplify('${tweet.id}')" ${
    isMe ? "disabled" : ""
  }>
                    Amplify
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
      // Optional: Visual feedback
      const btn = document.querySelector(`#tweet-${id} .tweet-actions button`);
      if (btn) {
        btn.textContent = "Amplified";
        btn.disabled = true;
      }
    } else {
      alert("Failed to amplify");
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
