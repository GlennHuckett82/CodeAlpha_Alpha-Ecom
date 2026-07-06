'use strict';

const { Router } = require('express');
const { flushCache } = require('../middleware/cache');

const router = Router();

/**
 * @openapi
 * /api/admin/cache:
 *   delete:
 *     tags: [Admin]
 *     summary: Flush the in-memory response cache
 *     description: >
 *       Immediately invalidates all cached product responses.
 *       Useful after a bulk product update so the next GET /api/products
 *       returns fresh data without waiting for the 60-second TTL to expire.
 *       Requires the `x-admin-key` header to match the `ADMIN_KEY` environment variable.
 *     operationId: flushCache
 *     security:
 *       - AdminKey: []
 *     responses:
 *       '200':
 *         description: OK — cache flushed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Cache flushed }
 *       '401':
 *         $ref: '#/components/responses/Forbidden'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
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
