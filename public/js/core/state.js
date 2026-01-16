export const DOM = {
    feed: document.getElementById("feed"),
    pingInput: document.getElementById("ping-input"),
    pingBtn: document.getElementById("ping-btn"),
    statusDot: document.getElementById("status-dot"),
    statusText: document.getElementById("status-text"),
    charCount: document.getElementById("char-count"),
    myAvatarSmall: document.getElementById("my-avatar-small"),
    myNameDisplay: document.getElementById("my-name-display"),
    myIdDisplay: document.getElementById("my-id"),
    swarmInput: document.getElementById("swarm-input"),
    joinSwarmBtn: document.getElementById("join-swarm-btn"),
    activeSwarmsEl: document.getElementById("active-swarms"),
    trendingList: document.getElementById("trending-list"),
    mainView: document.getElementById("main-view"),
    profileView: document.getElementById("profile-view"),
    profileInfo: document.getElementById("profile-info"),
    profileFeed: document.getElementById("profile-feed"),
    feedEl: document.getElementById("feed"),
};

export const state = {
    myId: "",
    currentTopic: "",
    currentSwarmId: 0,
    currentTab: "foryou",
    currentProfileId: "",
    joinedSwarms: JSON.parse(localStorage.getItem("joinedSwarms") || '[""]'),
    following: JSON.parse(localStorage.getItem("following") || "[]"),
    blocked: JSON.parse(localStorage.getItem("blocked") || "[]"),
    usernameCache: new Map(),
    lastActiveTimestamp: Date.now(),
    isTabVisible: true,
};

export function saveToLocalStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}
