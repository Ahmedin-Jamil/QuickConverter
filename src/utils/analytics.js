// Google Analytics Integration
// Replace 'G-XXXXXXXXXX' with your actual Google Analytics Measurement ID

let analyticsInitialized = false;

/**
 * Initialize Google Analytics
 * @param {string} measurementId - Your GA4 Measurement ID
 */
export function initAnalytics(measurementId = null) {
    if (analyticsInitialized || !measurementId) {
        return;
    }

    // Load Google Analytics script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', measurementId, {
        'send_page_view': false // We'll send page views manually
    });

    analyticsInitialized = true;
}

/**
 * Track page view
 * @param {string} pagePath - Optional page path
 */
export function trackPageView(pagePath = window.location.pathname) {
    if (window.gtag) {
        window.gtag('event', 'page_view', {
            page_path: pagePath,
            page_title: document.title,
            page_location: window.location.href
        });
    }
}

/**
 * Track custom event
 * @param {string} eventName - Name of the event
 * @param {Object} eventParams - Event parameters
 */
export function trackEvent(eventName, eventParams = {}) {
    if (window.gtag) {
        window.gtag('event', eventName, eventParams);
    }
}

/**
 * Track file conversion
 * @param {string} toolName - Name of the conversion tool
 * @param {string} fromFormat - Source format
 * @param {string} toFormat - Target format
 * @param {number} fileSize - File size in bytes
 */
export function trackConversion(toolName, fromFormat, toFormat, fileSize = 0) {
    trackEvent('file_conversion', {
        tool_name: toolName,
        from_format: fromFormat,
        to_format: toFormat,
        file_size: fileSize,
        file_size_mb: (fileSize / 1024 / 1024).toFixed(2)
    });
}

/**
 * Track download
 * @param {string} fileName - Name of the downloaded file
 * @param {string} fileType - Type of file
 */
export function trackDownload(fileName, fileType) {
    trackEvent('file_download', {
        file_name: fileName,
        file_type: fileType
    });
}

/**
 * Track tool usage
 * @param {string} toolName - Name of the tool
 */
export function trackToolUsage(toolName) {
    trackEvent('tool_usage', {
        tool_name: toolName
    });
}

/**
 * Track errors
 * @param {string} errorMessage - Error message
 * @param {string} errorLocation - Where the error occurred
 */
export function trackError(errorMessage, errorLocation) {
    trackEvent('error', {
        error_message: errorMessage,
        error_location: errorLocation
    });
}

// Export for use in other modules
export default {
    initAnalytics,
    trackPageView,
    trackEvent,
    trackConversion,
    trackDownload,
    trackToolUsage,
    trackError
};
