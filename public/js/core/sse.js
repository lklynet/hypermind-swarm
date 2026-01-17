import { state } from "./state.js";
import { fetchCatchup } from "./api.js";

let evtSource = null;
let onInitCallback = null;
let onUpdateCallback = null;
let onPingCallback = null;

export function setSSECallbacks({ onInit, onUpdate, onPing }) {
    onInitCallback = onInit;
    onUpdateCallback = onUpdate;
    onPingCallback = onPing;
}

export function startSSE() {
    console.log("Initializing EventSource...");
    evtSource = new EventSource("/events");

    evtSource.onopen = () => {
        console.log("EventSource connected");
    };

    evtSource.onerror = (err) => {
        if (evtSource.readyState === EventSource.CLOSED) {
            console.error("EventSource connection closed permanently.", err);
        }
    };

    evtSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);

            if (data.type === "INIT") {
                state.myId = data.id;
                if (onInitCallback) onInitCallback(data);
            } else if (data.type === "UPDATE") {
                if (onUpdateCallback) onUpdateCallback(data);
            } else if (data.type === "PING") {
                if (onPingCallback) onPingCallback(data);
            } else if (data.count !== undefined) {
                if (onUpdateCallback) onUpdateCallback(data);
            }
        } catch (err) {
            console.error("Error processing event data:", err);
        }
    };
}

export function setupTabVisibility() {
    document.addEventListener("visibilitychange", async () => {
        if (document.hidden) {
            state.isTabVisible = false;
            state.lastActiveTimestamp = Date.now();
        } else {
            state.isTabVisible = true;
            await catchUpMissedPings();
        }
    });
}

async function catchUpMissedPings() {
    if (!state.lastActiveTimestamp) return;

    try {
        const data = await fetchCatchup(state.lastActiveTimestamp);
        if (data.pings && data.pings.length > 0 && onPingCallback) {
            for (const ping of data.pings) {
                onPingCallback(ping);
            }
            console.log(`Caught up on ${data.pings.length} missed pings`);
        }
        state.lastActiveTimestamp = data.serverTime || Date.now();
    } catch (e) {
        console.error("Failed to catch up:", e);
    }
}

export function closeSSE() {
    if (evtSource) {
        evtSource.close();
        evtSource = null;
    }
}
