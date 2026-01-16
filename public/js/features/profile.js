import { DOM, state, saveToLocalStorage } from "../core/state.js";
import { fetchProfile } from "../core/api.js";
import { escapeHtml } from "../utils/html.js";
import { getColorFromId, getFractalFromId } from "../utils/banner-generator.js";
import { addPingToContainer, updateFeedVisibility } from "./feed.js";
import { updateUrl } from "../utils/url.js";

export async function showProfile(id, push = true) {
    state.currentProfileId = id;
    DOM.mainView.style.display = "none";
    DOM.profileView.style.display = "block";

    if (push) updateUrl({ u: id });

    DOM.profileInfo.innerHTML = "Loading...";
    DOM.profileFeed.innerHTML = "";

    try {
        const data = await fetchProfile(id);

        if (data.username) {
            state.usernameCache.set(data.id, data.username);
        }

        const avatarUrl = `/api/avatar/${data.id}`;
        const isFollowing = state.following.includes(data.id);
        const isMe = data.id === state.myId;

        DOM.profileInfo.innerHTML = `
      <div class="profile-cover" style="background-image: url('${getFractalFromId(data.id + "banner")}'); background-size: cover;"></div>
      <div class="profile-details">
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div class="avatar profile-avatar-large" style="background-image: url('${avatarUrl}'); background-color: ${getColorFromId(data.id + "pfp")};"></div>
          ${!isMe ? `
            <button class="ping-btn-large" style="width: auto; padding: 0.5rem 1.5rem; margin: 0;" onclick="window.toggleFollow('${data.id}')">
              ${isFollowing ? "Unfollow" : "Follow"}
            </button>
          ` : ""}
        </div>
        <div>
          <div class="profile-name-large">${escapeHtml(data.username)}${isFollowing ? ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 1.2rem;" title="Following"></i>' : ""}</div>
          <div class="profile-handle-large">@${data.id.slice(-8)}</div>
        </div>
        <div class="profile-stats">
          <span><span class="stat-value">${data.pings.length}</span> Pings</span>
        </div>
      </div>
    `;

        if (data.pings.length === 0) {
            DOM.profileFeed.innerHTML = "<div style='padding: 2rem; text-align: center; color: var(--text-muted);'>No pings yet.</div>";
        } else {
            data.pings.forEach((ping) => {
                addPingToContainer(ping, DOM.profileFeed, false);
            });
        }
    } catch (e) {
        DOM.profileInfo.innerHTML = "Failed to load profile.";
        console.error(e);
    }
}

export function showFeed(push = true) {
    state.currentProfileId = "";
    DOM.profileView.style.display = "none";
    DOM.mainView.style.display = "block";
    if (push) updateUrl({ u: null });
}

export function showMyProfile() {
    if (state.myId) showProfile(state.myId);
}

export function toggleFollow(id) {
    if (state.following.includes(id)) {
        state.following = state.following.filter((f) => f !== id);
    } else {
        state.following.push(id);
    }
    const isNowFollowing = state.following.includes(id);
    saveToLocalStorage("following", state.following);

    renderFollowedAccounts();
    updateFollowedStateInFeed(id, isNowFollowing);

    if (DOM.profileView.style.display === "block") {
        showProfile(id);
    }

    if (state.currentTab === "following") {
        updateFeedVisibility();
    }
}

function updateFollowedStateInFeed(userId, isFollowing) {
    const pings = document.querySelectorAll(`[data-author="${userId}"]`);
    pings.forEach((pingEl) => {
        const authorSpan = pingEl.querySelector(".ping-author");
        if (authorSpan) {
            const existingCheck = authorSpan.querySelector(".fa-circle-check");
            if (isFollowing && !existingCheck) {
                authorSpan.insertAdjacentHTML(
                    "beforeend",
                    ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.85rem;" title="Following"></i>'
                );
            } else if (!isFollowing && existingCheck) {
                existingCheck.remove();
            }
        }

        const commentAuthors = pingEl.querySelectorAll(".comment-author");
        commentAuthors.forEach((commentAuthor) => {
            if (commentAuthor.getAttribute("onclick")?.includes(`'${userId}'`)) {
                const existingCheck = commentAuthor.querySelector(".fa-circle-check");
                if (isFollowing && !existingCheck) {
                    commentAuthor.insertAdjacentHTML(
                        "beforeend",
                        ' <i class="fa-solid fa-circle-check" style="color: var(--primary-color); font-size: 0.75rem;" title="Following"></i>'
                    );
                } else if (!isFollowing && existingCheck) {
                    existingCheck.remove();
                }
            }
        });
    });
}

export async function renderFollowedAccounts() {
    const container = document.getElementById("followed-accounts-list");
    if (!container) return;

    container.innerHTML = "";
    if (state.following.length === 0) {
        container.innerHTML = `<div style="padding: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">No followed accounts.</div>`;
        return;
    }

    for (const id of state.following) {
        const el = document.createElement("div");
        el.className = "followed-item";
        el.style.cssText = "display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; cursor: pointer; border-radius: 8px; transition: background-color 0.2s;";

        el.onmouseover = () => { el.style.backgroundColor = "var(--hover-bg)"; };
        el.onmouseout = () => { el.style.backgroundColor = "transparent"; };
        el.onclick = () => showProfile(id);

        const avatarUrl = `/api/avatar/${id}`;
        let name = state.usernameCache.get(id) || "..." + id.slice(-8);

        if (!state.usernameCache.has(id)) {
            try {
                const data = await fetchProfile(id);
                name = data.username;
                state.usernameCache.set(id, name);
            } catch (e) {
                console.error("Failed to fetch profile for", id, e);
            }
        }

        el.innerHTML = `
      <img src="${avatarUrl}" class="avatar" style="width: 32px; height: 32px; border-radius: 50%; background-color: ${getColorFromId(id + "pfp")};">
      <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(name)}</span>
    `;
        container.appendChild(el);
    }
}

export function updateMyProfileWidget(data) {
    if (DOM.myNameDisplay) DOM.myNameDisplay.textContent = data.username || "Anonymous";
    if (DOM.myIdDisplay) DOM.myIdDisplay.textContent = "@" + data.id.slice(-8);
    if (DOM.myAvatarSmall) {
        DOM.myAvatarSmall.style.backgroundImage = `url(/api/avatar/${data.id})`;
        DOM.myAvatarSmall.style.backgroundColor = getColorFromId(data.id + "pfp");
    }

    const composeAvatar = document.getElementById("compose-avatar");
    const mobileTriggerAvatar = document.getElementById("mobile-trigger-avatar");

    if (composeAvatar) {
        composeAvatar.style.backgroundImage = `url(/api/avatar/${data.id})`;
        composeAvatar.style.backgroundColor = getColorFromId(data.id + "pfp");
    }

    if (mobileTriggerAvatar) {
        mobileTriggerAvatar.style.backgroundImage = `url(/api/avatar/${data.id})`;
        mobileTriggerAvatar.style.backgroundColor = getColorFromId(data.id + "pfp");
    }
}

window.showProfile = showProfile;
window.showFeed = showFeed;
window.showMyProfile = showMyProfile;
window.toggleFollow = toggleFollow;
