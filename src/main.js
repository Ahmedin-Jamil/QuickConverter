// Main JavaScript Entry Point
import './styles/main.css';
import './styles/components.css';
import './styles/social.css';

// Initialize analytics (ready for Google Analytics)
import { initAnalytics, trackPageView } from './utils/analytics.js';
import { initSharing } from './utils/share.js';

// Initialize SEO utilities
import { updateMetaTags } from './utils/seo.js';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Analytics (Replace with your actual ID, e.g., 'G-XXXXXXXXXX')
  initAnalytics('G-YOUR-ID-HERE');

  // Track page view
  trackPageView();

  // Initialize social sharing
  initSharing();

  // Add smooth scroll behavior for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#' || !href.startsWith('#')) return;

      try {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      } catch (err) {
        console.warn('Invalid scroll target:', href);
      }
    });
  });

  // Add animation on scroll
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-slideUp');
      }
    });
  }, observerOptions);

  // Observe all cards and tool cards
  document.querySelectorAll('.card, .tool-card').forEach(el => {
    observer.observe(el);
  });
});

// Export for use in other modules
export { initAnalytics, trackPageView, updateMetaTags };
