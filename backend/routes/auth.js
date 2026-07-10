'use strict';

// Auth routes — register & login with bcrypt password hashing and JWT signing.
// The API is fully implemented and covered by the Jest test suite.
// Frontend account pages (login.html / register.html) are the planned next step;
// once in place they will exchange credentials for the signed JWT returned here.

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const router = Router();

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Creates a new user account. Passwords are stored as bcrypt hashes (10 rounds).
 *     operationId: registerUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: shopper@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: s3cr3tP@ss
 *     responses:
 *       '201':
 *         description: Created — user registered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/UserPublic' }
 *       '409':
 *         description: Conflict — email already registered.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { success: false, error: Email already registered }
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', [
  body('email')
    .isEmail()
    .withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('password must be at least 6 characters'),
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  try {
    const { email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hash });

    return res.status(201).json({
      success: true,
      data: { id: user._id, email: user.email },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and obtain a JWT
 *     description: >
 *       Returns a signed JWT (24 h expiry) on success.
 *       The same 401 message is returned for both wrong email and wrong password
 *       to prevent credential enumeration.
 *     operationId: loginUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: shopper@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: s3cr3tP@ss
 *     responses:
 *       '200':
 *         description: OK — JWT issued.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 token:
 *                   type: string
 *                   description: 'JWT Bearer token — send as: Authorization: Bearer <token>'
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123
 *       '401':
 *         description: Unauthorized — invalid credentials.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { success: false, error: Invalid credentials }
 *       '422':
 *         $ref: '#/components/responses/ValidationError'
 *       '500':
 *         $ref: '#/components/responses/InternalError'
 */
// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('email must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('password is required'),
], async (req, res, next) => {
  if (sendValidationErrors(req, res)) return;

  try {
    const { email, password } = req.body;

    // Explicitly request the password field (select: false by default)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      // Return the same message for wrong email or wrong password to prevent enumeration
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' },
    );

    return res.status(200).json({ success: true, token });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
