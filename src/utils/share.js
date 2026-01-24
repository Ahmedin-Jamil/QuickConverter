/**
 * Share Utilities for QuickConvert
 */

export const shareData = {
    title: 'QuickConvert - Privacy-First File Tools',
    text: 'Check out this awesome free file converter! It runs 100% in your browser.',
    url: 'https://q-convert.com'
};

/**
 * Trigger native share if available, fallback to clipboard
 */
export async function shareSite() {
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            // Silently fail share or handle error gracefully
        }
    } else {
        copyToClipboard(shareData.url);
    }
}

/**
 * Generate social sharing links
 */
export function getShareLinks(customText, customUrl) {
    const text = encodeURIComponent(customText || shareData.text);
    const url = encodeURIComponent(customUrl || shareData.url);

    return {
        twitter: `https://x.com/quick_converter`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
        whatsapp: `https://api.whatsapp.com/send?text=${text}%20${url}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`
    };
}

/**
 * Copy to clipboard fallback
 */
export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showShareToast('Link copied to clipboard!');
    });
}

/**
 * Show a quick toast notification
 */
export function showShareToast(message) {
    let toast = document.querySelector('.share-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'share-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('active');

    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

/**
 * Initialize floating sharing sidebar
 */
export function initSharing() {
    const sidebar = document.createElement('div');
    sidebar.className = 'share-sidebar';

    const links = getShareLinks();

    sidebar.innerHTML = `
        <a href="${links.twitter}" target="_blank" class="share-btn" title="Follow on Twitter" aria-label="Follow on Twitter">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
        </a>
    `;

    document.body.appendChild(sidebar);

    // Mobile FAB
    const fab = document.createElement('button');
    fab.className = 'mobile-share-fab';
    fab.setAttribute('aria-label', 'Share site');
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>';

    fab.addEventListener('click', shareSite);
    document.body.appendChild(fab);
}
