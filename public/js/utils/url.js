export function updateUrl(params = {}) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    });

    if (url.toString() !== window.location.href) {
        window.history.pushState({}, '', url);
    }
}

export function getUrlParams() {
    const url = new URL(window.location);
    return {
        userId: url.searchParams.get('u'),
        pingId: url.searchParams.get('p'),
        tab: url.searchParams.get('t')
    };
}
