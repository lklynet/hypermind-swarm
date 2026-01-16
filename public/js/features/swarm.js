import { DOM, state, saveToLocalStorage } from "../core/state.js";
import { joinSwarmApi, leaveSwarmApi } from "../core/api.js";
import { showToast } from "../utils/toast.js";
import { updateFeedVisibility } from "./feed.js";

export async function getSwarmId(name) {
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

export async function joinSwarm(topic) {
    if (!topic) return;
    const normalized = topic.trim().toLowerCase();
    if (state.joinedSwarms.includes(normalized)) {
        selectSwarm(normalized);
        return;
    }

    try {
        await joinSwarmApi(normalized);
        state.joinedSwarms.push(normalized);
        saveToLocalStorage("joinedSwarms", state.joinedSwarms);
        renderSwarmTags();
        selectSwarm(normalized);
        showToast(`Joined swarm #${normalized}`, "success");
    } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to join swarm", "error");
    }
}

export async function leaveSwarm(topic) {
    if (!topic) return;
    const normalized = topic.trim().toLowerCase();

    try {
        await leaveSwarmApi(normalized);
        state.joinedSwarms = state.joinedSwarms.filter((t) => t !== normalized);
        saveToLocalStorage("joinedSwarms", state.joinedSwarms);
        if (state.currentTopic === normalized) {
            selectSwarm("");
        } else {
            renderSwarmTags();
        }
        showToast(`Left swarm #${normalized}`, "info");
    } catch (e) {
        console.error(e);
        showToast("Failed to leave swarm", "error");
    }
}

export async function selectSwarm(topic) {
    const normalized = (topic || "").trim().toLowerCase();
    state.currentTopic = normalized;

    if (!normalized) {
        state.currentSwarmId = 0;
        if (DOM.pingInput) DOM.pingInput.placeholder = "What is happening in Global?!";
    } else {
        state.currentSwarmId = await getSwarmId(normalized);
        if (DOM.pingInput) DOM.pingInput.placeholder = `Ping #${normalized}...`;
    }

    renderSwarmTags();
    updateFeedVisibility();
}

export function renderSwarmTags() {
    if (!DOM.activeSwarmsEl) return;
    DOM.activeSwarmsEl.innerHTML = "";

    if (!state.joinedSwarms.includes("")) {
        state.joinedSwarms.unshift("");
    }

    state.joinedSwarms.forEach((topic) => {
        const container = document.createElement("div");
        container.className = `swarm-item ${topic === state.currentTopic ? "active" : ""}`;
        container.onclick = () => selectSwarm(topic);

        const label = document.createElement("span");
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

        DOM.activeSwarmsEl.appendChild(container);
    });
}

export async function initSwarms() {
    for (const topic of state.joinedSwarms) {
        if (topic) {
            try {
                await joinSwarmApi(topic);
            } catch (e) {
                console.error(`Failed to rejoin swarm ${topic}`, e);
            }
        }
    }
}

export function setupSwarmListeners() {
    if (DOM.joinSwarmBtn) {
        DOM.joinSwarmBtn.onclick = () => {
            const topic = DOM.swarmInput.value.trim();
            if (topic) {
                joinSwarm(topic);
                DOM.swarmInput.value = "";
            }
        };
    }
}

window.joinSwarm = joinSwarm;
