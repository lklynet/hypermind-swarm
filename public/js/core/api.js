async function apiRequest(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: "same-origin",
    });
    if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("auth-required"));
    }
    return res;
}

export async function fetchAuthStatus() {
    const res = await apiRequest("/api/auth/status");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch auth status");
}

export async function loginAuth(username, password) {
    const res = await apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to login");
}

export async function logoutAuth() {
    const res = await apiRequest("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to logout");
}

export async function fetchWhoami() {
    const res = await apiRequest("/api/whoami");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch identity");
}

export async function fetchPings() {
    const res = await apiRequest("/api/pings");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch pings");
}

export async function fetchProfile(id) {
    const res = await apiRequest(`/api/profile/${id}`);
    if (res.ok) return res.json();
    throw new Error("Failed to fetch profile");
}

export async function fetchPing(id) {
    const res = await apiRequest(`/api/ping/${id}`);
    if (res.ok) return res.json();
    throw new Error("Failed to fetch ping");
}

export async function fetchTrending() {
    const res = await apiRequest("/api/trending");
    if (res.ok) return res.json();
    throw new Error("Failed to fetch trending");
}

export async function fetchCatchup(since) {
    const res = await apiRequest(`/api/catchup?since=${since}`);
    if (res.ok) return res.json();
    throw new Error("Failed to fetch catchup");
}

export async function postPing(content, topic) {
    const res = await apiRequest("/api/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, topic }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to send ping");
}

export async function postAmplify(id) {
    const res = await apiRequest("/api/amplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to amplify");
}

export async function postComment(pingId, content) {
    const res = await apiRequest("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pingId, content }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to send comment");
}

export async function joinSwarmApi(name) {
    const res = await apiRequest("/api/swarm/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to join swarm");
}

export async function leaveSwarmApi(name) {
    const res = await apiRequest("/api/swarm/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (res.ok) return res.json();
    const err = await res.json();
    throw new Error(err.error || "Failed to leave swarm");
}
