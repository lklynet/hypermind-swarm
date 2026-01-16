import { state } from '../core/state.js';

function setupMobileNavigation() {
    const leftToggle = document.getElementById('toggle-left-sidebar');
    const rightToggle = document.getElementById('toggle-right-sidebar');
    const leftSidebar = document.querySelector('.sidebar-left');
    const rightSidebar = document.querySelector('.sidebar-right');
    const mobileAvatar = document.getElementById('mobile-avatar');
    const myAvatarSmall = document.getElementById('my-avatar-small');

    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    function closeSidebars() {
        leftSidebar?.classList.remove('active');
        rightSidebar?.classList.remove('active');
        leftToggle?.classList.remove('active');
        rightToggle?.classList.remove('active');
        overlay.classList.remove('active');
    }

    function toggleLeftSidebar() {
        const isActive = leftSidebar?.classList.contains('active');
        closeSidebars();
        if (!isActive) {
            leftSidebar?.classList.add('active');
            leftToggle?.classList.add('active');
            overlay.classList.add('active');
        }
    }

    function toggleRightSidebar() {
        const isActive = rightSidebar?.classList.contains('active');
        closeSidebars();
        if (!isActive) {
            rightSidebar?.classList.add('active');
            rightToggle?.classList.add('active');
            overlay.classList.add('active');
        }
    }

    leftToggle?.addEventListener('click', toggleLeftSidebar);
    rightToggle?.addEventListener('click', toggleRightSidebar);
    overlay?.addEventListener('click', closeSidebars);

    if (myAvatarSmall && mobileAvatar) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    mobileAvatar.style.cssText = myAvatarSmall.style.cssText;
                }
            });
        });
        observer.observe(myAvatarSmall, { attributes: true, attributeFilter: ['style'] });
        mobileAvatar.style.cssText = myAvatarSmall.style.cssText;
    }
}

export { setupMobileNavigation };
