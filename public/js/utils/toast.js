export function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "fa-info-circle";
    if (type === "error") icon = "fa-circle-exclamation";
    if (type === "success") icon = "fa-circle-check";

    toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
