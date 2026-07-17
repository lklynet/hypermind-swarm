import { state } from "../core/state.js";
import { showModal, closeModal } from "../utils/modal.js";

class NotificationManager {
    constructor() {
        this.notifications = [];
        this.startTime = null;
        this.load();
    }

    load() {
        const stored = localStorage.getItem("notifications");
        const startTime = localStorage.getItem("notificationsStartTime");

        if (stored) {
            this.notifications = JSON.parse(stored);
        }

        if (startTime) {
            this.startTime = parseInt(startTime);
        } else {
            this.startTime = Date.now();
            localStorage.setItem("notificationsStartTime", this.startTime.toString());
        }

        this._pushDockBadge();
    }

    save() {
        localStorage.setItem("notifications", JSON.stringify(this.notifications));
    }

    _addNotification(notification) {
        this.notifications.unshift(notification);
        this.save();
        this.updateBadge();
    }

    addCommentNotification(ping, comment) {
        if (comment.author === state.myId) return;
        if (comment.timestamp < this.startTime) return;

        const existingIndex = this.notifications.findIndex(
            n => n.commentId === comment.id
        );
        if (existingIndex !== -1) return;

        const isMyPing = ping.author === state.myId;
        const mentionsMe = this._checkMention(comment.content);

        if (!isMyPing && !mentionsMe) return;

        const notification = {
            id: `notif-comment-${comment.id}`,
            type: mentionsMe ? "mention" : "comment",
            pingId: ping.id,
            commentId: comment.id,
            author: comment.author,
            username: comment.username,
            content: comment.content,
            timestamp: comment.timestamp,
            read: false
        };

        this._addNotification(notification);
    }

    addPingNotification(ping) {
        if (ping.author === state.myId) return;
        if (ping.timestamp < this.startTime) return;

        const existingIndex = this.notifications.findIndex(
            n => n.pingId === ping.id && !n.commentId
        );
        if (existingIndex !== -1) return;

        const mentionsMe = this._checkMention(ping.content);
        if (!mentionsMe) return;

        const notification = {
            id: `notif-ping-${ping.id}`,
            type: "mention",
            pingId: ping.id,
            author: ping.author,
            username: ping.username,
            content: ping.content,
            timestamp: ping.timestamp,
            read: false
        };

        this._addNotification(notification);
    }

    _checkMention(content) {
        if (!state.myId) return false;
        const myUsername = state.usernameCache.get(state.myId);
        if (!myUsername) return false;

        const mentionPattern = new RegExp(`@${myUsername}\\b`, 'i');
        return mentionPattern.test(content);
    }

    markAsRead(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            this.save();
            this.updateBadge();
        }
    }

    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.save();
        this.updateBadge();
    }

    getUnreadCount() {
        return this.notifications.filter(n => !n.read).length;
    }

    getAll() {
        return this.notifications;
    }

    updateBadge() {
        const badges = [
            document.getElementById("notification-badge-mobile"),
            document.getElementById("notification-badge-desktop")
        ];
        const count = this.getUnreadCount();

        badges.forEach(badge => {
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? "99+" : count;
                    badge.style.display = "inline-flex";
                } else {
                    badge.style.display = "none";
                }
            }
        });

        this._pushDockBadge();
    }

    _pushDockBadge() {
        const count = this.getUnreadCount();
        if (window.hypermind?.setBadge) {
            window.hypermind.setBadge(count > 0 ? String(count) : "");
        }
    }
}

export const notificationManager = new NotificationManager();

export function showNotifications() {
    const notifications = notificationManager.getAll();

    let content;
    if (notifications.length === 0) {
        content = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No notifications yet</div>';
    } else {
        content = `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 1rem;">
                <button id="mark-all-read-btn" style="background: transparent; border: none; color: var(--primary-color); cursor: pointer; font-size: 0.9rem; font-weight: 600; padding: 0.25rem 0.5rem;">
                    Mark all as read
                </button>
            </div>
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${notifications.map(n => {
            const timeAgo = getTimeAgo(n.timestamp);
            let notifText;
            if (n.type === "mention") {
                // Check if it's a comment mention or ping mention
                notifText = n.commentId
                    ? `<strong>${n.username || 'Anonymous'}</strong> mentioned you in a comment`
                    : `<strong>${n.username || 'Anonymous'}</strong> mentioned you in a ping`;
            } else {
                notifText = `<strong>${n.username || 'Anonymous'}</strong> commented on your ping`;
            }
            return `
                        <li style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); cursor: pointer; ${!n.read ? 'background-color: rgba(252, 163, 17, 0.1);' : ''}"
                            data-id="${n.id}"
                            data-ping-id="${n.pingId}"
                            class="notification-item">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                                <div style="flex: 1;">
                                    <div style="font-size: 0.95rem; line-height: 1.4; margin-bottom: 0.25rem;">
                                        ${notifText}
                                    </div>
                                    <div style="font-size: 0.85rem; color: var(--text-muted);">${timeAgo}</div>
                                </div>
                                ${!n.read ? '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--primary-color); flex-shrink: 0; margin-top: 0.4rem;"></div>' : ''}
                            </div>
                        </li>
                    `;
        }).join('')}
            </ul>
        `;
    }

    showModal({
        title: "Notifications",
        content: content,
        onClose: () => { }
    });

    const markAllBtn = document.getElementById("mark-all-read-btn");
    if (markAllBtn) {
        markAllBtn.onclick = () => {
            notificationManager.markAllAsRead();
            showNotifications();
        };
    }

    document.querySelectorAll('.notification-item').forEach(item => {
        item.onclick = () => {
            const notifId = item.dataset.id;
            const pingId = item.dataset.pingId;
            notificationManager.markAsRead(notifId);
            closeModal();
            window.showPing(pingId);
        };
    });
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
}

export function setupNotificationListeners() {
    const mobileBell = document.getElementById("notification-bell-mobile");
    const desktopBtn = document.getElementById("notification-btn-desktop");

    if (mobileBell) {
        mobileBell.onclick = () => showNotifications();
    }

    if (desktopBtn) {
        desktopBtn.onclick = () => showNotifications();
    }

    notificationManager.updateBadge();
}

window.showNotifications = showNotifications;
