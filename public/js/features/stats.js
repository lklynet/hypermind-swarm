import { DOM } from "../core/state.js";
import { formatBytes, formatUptime } from "../utils/formatters.js";
import { setText } from "../utils/html.js";

export function updateStats(data) {
    if (data.count !== undefined) {
        setText("diag-active-nodes", data.count);
    }

    if (data.totalUnique !== undefined) {
        setText("diag-total-unique", data.totalUnique);
    }

    if (data.direct !== undefined) {
        setText("diag-direct-conns", data.direct);

        if (DOM.statusDot && DOM.statusText) {
            if (data.direct > 0) {
                DOM.statusDot.className = "status-dot connected";
                DOM.statusText.textContent = "connected";
            } else {
                DOM.statusDot.className = "status-dot connecting";
                DOM.statusText.textContent = "connecting...";
            }
        }
    }

    if (data.diagnostics) {
        const d = data.diagnostics;

        setText("diag-bytes-in", formatBytes((d.bytesReceived || 0) / 10) + "/s");
        setText("diag-bytes-out", formatBytes((d.bytesSent || 0) / 10) + "/s");
        setText(
            "diag-relayed",
            (d.heartbeatsRelayed || 0) + (d.pingsRelayed || 0) + (d.amplifyRelayed || 0)
        );
        setText("diag-pings-sent", d.pingsSent || 0);

        setText("diag-invalid-sig", d.invalidSig || 0);
        setText("diag-invalid-pow", d.invalidPoW || 0);
        setText("diag-duplicates", d.duplicateSeq || 0);

        setText("diag-uptime", formatUptime(d.uptime || 0));
        if (d.memory && d.memory.rss) {
            setText("diag-memory", Math.round(d.memory.rss / 1024 / 1024) + " MB");
        }
    }
}
