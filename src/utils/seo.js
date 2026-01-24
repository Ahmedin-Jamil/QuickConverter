// SEO Utilities for QuickConvert

/**
 * Update meta tags dynamically for different pages
 * @param {Object} options - Meta tag options
 */
export function updateMetaTags(options = {}) {
    const {
        title = 'QuickConvert - Free Online File Converter',
        description = 'Free online file converter. Convert images, PDFs, and more.',
        keywords = 'file converter, image converter, free converter',
        canonical = window.location.href,
        ogImage = '/og-image.jpg',
        ogType = 'website'
    } = options;

    // Update title
    document.title = title;

    // Update or create meta tags
    updateMetaTag('name', 'description', description);
    updateMetaTag('name', 'keywords', keywords);
    updateMetaTag('property', 'og:title', title);
    updateMetaTag('property', 'og:description', description);
    updateMetaTag('property', 'og:image', ogImage);
    updateMetaTag('property', 'og:type', ogType);
    updateMetaTag('property', 'og:url', canonical);
    updateMetaTag('property', 'twitter:title', title);
    updateMetaTag('property', 'twitter:description', description);
    updateMetaTag('property', 'twitter:image', ogImage);

    // Global SEO Signals
    updateMetaTag('name', 'geo.region', 'US;GB;AE;SA;KW;OM;LB;YE;QA;PH;ID;MY;IN;AU;JP;KR;TH;PK;CN;TW;EG;NG;ET;SD;DZ;TN;GH;UG;ER;CA;EU');
    updateMetaTag('name', 'geo.placename', 'Global');

    // Update canonical link
    updateCanonicalLink(canonical);
}

/**
 * Update or create a meta tag
 */
function updateMetaTag(attribute, key, content) {
    let element = document.querySelector(`meta[${attribute}="${key}"]`);

    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
    }

    element.setAttribute('content', content);
}

/**
 * Update canonical link
 */
function updateCanonicalLink(url) {
    let link = document.querySelector('link[rel="canonical"]');

    if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
    }

    link.setAttribute('href', url);
}

/**
 * Generate structured data (JSON-LD) for a tool page
 */
export function generateToolStructuredData(toolName, toolDescription, toolUrl) {
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": toolName,
        "description": toolDescription,
        "url": toolUrl,
        "applicationCategory": "UtilityApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
        },
        "creator": {
            "@type": "Organization",
            "name": "QuickConvert"
        }
    };

    // Add or update script tag
    let script = document.querySelector('script[type="application/ld+json"][data-tool]');

    if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-tool', 'true');
        document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(structuredData);
}

/**
 * Generate structured data for blog posts
 */
export function generateBlogStructuredData(article) {
    const {
        title,
        description,
        author = 'QuickConvert Team',
        datePublished,
        dateModified = datePublished,
        image,
        url
    } = article;

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": description,
        "image": image,
        "author": {
            "@type": "Person",
            "name": author
        },
        "publisher": {
            "@type": "Organization",
            "name": "QuickConvert",
            "logo": {
                "@type": "ImageObject",
                "url": "https://q-convert.com/logo.png"
            }
        },
        "datePublished": datePublished,
        "dateModified": dateModified,
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": url
        }
    };

    let script = document.querySelector('script[type="application/ld+json"][data-blog]');

    if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-blog', 'true');
        document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(structuredData);
}

/**
 * Generate breadcrumb structured data
 */
export function generateBreadcrumbStructuredData(breadcrumbs) {
    const itemListElement = breadcrumbs.map((crumb, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": crumb.name,
        "item": crumb.url
    }));

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": itemListElement
    };

    let script = document.querySelector('script[type="application/ld+json"][data-breadcrumb]');

    if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-breadcrumb', 'true');
        document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(structuredData);
}

/**
 * Track conversion events (for analytics)
 */
export function trackConversion(toolName, fromFormat, toFormat) {
    // This will be used with Google Analytics
    if (window.gtag) {
        window.gtag('event', 'conversion', {
            'tool_name': toolName,
            'from_format': fromFormat,
            'to_format': toFormat
        });
    }
}
