'use strict';

const { Router } = require('express');
const { flushCache } = require('../middleware/cache');

const router = Router();

/**
 * DELETE /api/admin/cache
 *
 * Flushes the entire in-memory response cache.
 * Requires an x-admin-key header matching the ADMIN_KEY environment variable.
 * Returns 401 when the key is absent, wrong, or ADMIN_KEY is not configured.
 */
router.delete('/cache', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  const providedKey = req.headers['x-admin-key'];

  if (!adminKey || providedKey !== adminKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  flushCache();
  return res.status(200).json({ success: true, message: 'Cache flushed' });
});

module.exports = router;
