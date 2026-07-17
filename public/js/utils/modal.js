export function getModalContainer() {
    let container = document.getElementById("global-modal-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "global-modal-container";
        container.className = "modal-overlay";
        container.innerHTML = `
            <div class="modal-window">
                <div class="modal-header">
                    <h3 class="modal-title"></h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body"></div>
            </div>
        `;
        document.body.appendChild(container);

        container.querySelector(".modal-close").addEventListener("click", closeModal);
        container.addEventListener("click", (e) => {
            if (e.target === container) closeModal();
        });
    }
    return container;
}

export function showModal({ title, content, onClose }) {
    const container = getModalContainer();
    const titleEl = container.querySelector(".modal-title");
    const bodyEl = container.querySelector(".modal-body");

    titleEl.textContent = title || "";
    bodyEl.innerHTML = "";

    if (typeof content === "string") {
        bodyEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        bodyEl.appendChild(content);
    }

    container.classList.add("active");
    container.onCloseCallback = onClose;
}

export function closeModal() {
    const container = document.getElementById("global-modal-container");
    if (container && container.classList.contains("active")) {
        container.classList.remove("active");
        if (container.onCloseCallback) {
            container.onCloseCallback();
            container.onCloseCallback = null;
        }
    }
}
