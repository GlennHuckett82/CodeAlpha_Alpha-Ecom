/**
 * utils.js — Shared utility functions (vanilla JS, no dependencies)
 */

/**
 * Returns a debounced version of `fn` that fires only after `ms` ms of silence.
 * Cancels any pending invocation whenever called again within the delay window.
 *
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Generates a cryptographically random UUID v4.
 * Delegates to crypto.randomUUID() (available in all modern browsers and
 * Node 14.17+; also works in secure contexts on mobile).
 *
 * @returns {string}
 */
export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Lazily loads images that carry a `data-src` attribute.
 * Uses IntersectionObserver when available; falls back to eager loading.
 *
 * @param {Document|Element} [container=document]
 */
export function lazyLoadImages(container = document) {
  const images = container.querySelectorAll('img[data-src]');
  if (!images.length) return;

  if (!('IntersectionObserver' in window)) {
    // Fallback: load all immediately
    images.forEach((img) => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
      });
    },
    { rootMargin: '200px' }, // start loading 200 px before entering viewport
  );

  images.forEach((img) => observer.observe(img));
}
