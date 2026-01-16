export async function fetchWhoami() {
    const res = await fetch("/api/whoami");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch identity");
}

export async function fetchPings() {
    const res = await fetch("/api/pings");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch pings");
}

export async function fetchProfile(id) {
    const res = await fetch(`/api/profile/${id}`);
    if (res.ok) return res.json();
    throw new Error("Failed to fetch profile");
}

export async function fetchPing(id) {
    const res = await fetch(`/api/ping/${id}`);
    if (res.ok) return res.json();
    throw new Error("Failed to fetch ping");
}

export async function fetchTrending() {
    const res = await fetch("/api/trending");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch trending");
}

export async function fetchCatchup(since) {
    const res = await fetch(`/api/catchup?since=${since}`);
    if (res.ok) return res.json();
    throw new Error("Failed to fetch catchup");
}

export async function postPing(content, topic) {
    const res = await fetch("/api/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, topic }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to send ping");
}

export async function postAmplify(id) {
    const res = await fetch("/api/amplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to amplify");
}

export async function postComment(pingId, content) {
    const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pingId, content }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to send comment");
}

export async function joinSwarmApi(name) {
    const res = await fetch("/api/swarm/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to join swarm");
}

export async function leaveSwarmApi(name) {
    const res = await fetch("/api/swarm/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to leave swarm");
}
