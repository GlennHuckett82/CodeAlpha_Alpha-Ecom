'use strict';

/**
 * Simple in-memory response cache backed by a Map.
 *
 * All middleware instances created by createCache() share the same store so
 * that flushCache() empties everything regardless of which instance wrote it.
 *
 * Cache key  = req.url (path + query string — unique per distinct URL)
 * Cache value = { status, body, expiresAt }
 */

/** @type {Map<string, { status: number, body: unknown, expiresAt: number }>} */
const store = new Map();

/**
 * Returns Express middleware that caches successful GET responses in memory.
 *
 * @param {number} ttlSeconds  Time-to-live in seconds (default 60)
 * @returns {import('express').RequestHandler}
 */
function createCache(ttlSeconds = 60) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = req.url;
    const cached = store.get(key);

    // Serve from cache if the entry exists and has not expired
    if (cached && Date.now() < cached.expiresAt) {
      res.set('X-Cache', 'HIT');
      return res.status(cached.status).json(cached.body);
    }

    // Cache miss — let the request proceed and capture the JSON response
    res.set('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only store successful responses so errors are never served as hits
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, {
          status: res.statusCode,
          body,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
      return originalJson(body);
    };

    return next();
  };
}

/** Removes every entry from the shared cache store. */
function flushCache() {
  store.clear();
}

/** Returns the number of entries currently held in the cache. */
function getCacheSize() {
  return store.size;
}

module.exports = { createCache, flushCache, getCacheSize };
