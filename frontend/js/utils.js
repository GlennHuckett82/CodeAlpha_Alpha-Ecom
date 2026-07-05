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
 * Lazily loads images that carry a `data-src` (and optionally `data-srcset`)
 * attribute, using a three-tier strategy:
 *
 * **Tier 1 — Native lazy loading** (`loading="lazy"`)
 *   Supported in: Chrome 77+, Edge 79+, Firefox 75+, Safari 15.4+, Opera 64+.
 *   The browser already defers the fetch when `loading="lazy"` is present.
 *   We simply copy `data-src` → `src` immediately and hand control to the
 *   browser's built-in scheduler.
 *
 * **Tier 2 — IntersectionObserver**
 *   Supported in: Chrome 51+, Edge 15+, Firefox 55+, Safari 12.1+.
 *   Needed for: Safari 12.1–15.3 (supports IO but not native lazy loading),
 *   and any future browser where `loading` is absent. We hold back `src`
 *   and set it only when the image is ~200 px from entering the viewport,
 *   giving the browser enough time to fetch and decode before painting.
 *
 * **Tier 3 — Eager fallback**
 *   Needed for: IE 11, very old Android WebView, KaiOS 2.x, and any other
 *   environment where neither API is available. Images are loaded
 *   immediately — functionally equivalent to no lazy-loading, but the page
 *   still works correctly.
 *
 * **Why `data-src` instead of `src`?**
 *   Setting `src` on an `<img>` immediately enqueues a network request.
 *   Storing the real URL in `data-src` while leaving `src` empty prevents
 *   any below-the-fold requests until one of the strategies above fires.
 *
 * @param {Document|Element} [container=document]
 */
export function lazyLoadImages(container = document) {
  const images = container.querySelectorAll('img[data-src]');
  if (!images.length) return;

  /** Promote data-src / data-srcset to their live counterparts then clean up. */
  function revealImage(img) {
    if (img.dataset.srcset) {
      img.srcset = img.dataset.srcset;
      img.removeAttribute('data-srcset');
    }
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  }

  // Tier 1 — native lazy loading (browser handles the deferral)
  if ('loading' in HTMLImageElement.prototype) {
    images.forEach(revealImage);
    return;
  }

  // Tier 2 — IntersectionObserver
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealImage(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '200px 0px' }, // pre-load 200 px before entering viewport
    );
    images.forEach((img) => observer.observe(img));
    return;
  }

  // Tier 3 — eager fallback
  images.forEach(revealImage);
}
