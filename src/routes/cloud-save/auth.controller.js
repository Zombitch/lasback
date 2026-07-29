import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Player } from './player.model.js';
import { config } from '../../utils/configLoader.js';

// Computed once at startup and compared against on every login where the
// account doesn't exist, so a missing account takes the same time as a
// wrong password — otherwise the bcrypt.compare skip is a timing oracle
// an attacker can use to enumerate registered emails.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-account', 12);

function signToken(player) {
  return jwt.sign(
    { sub: player._id, username: player.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

/**
 * POST /v1/auth/register
 *
 * Body: { username, email, password }
 * Returns a JWT on success.
 */
export async function register(req, res) {
  const { username, email, password } = req.body ?? {};

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: '`username`, `email`, and `password` are required',
    });
  }

  if (typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({
      success: false,
      message: 'Username must be at least 3 characters',
    });
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'A valid email is required',
    });
  }

  // bcrypt silently truncates at 72 bytes — enforce a max to avoid surprises
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({
      success: false,
      message: 'Password must be 8–72 characters',
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.trim().slice(0, 100);

  const existing = await Player.findOne({
    $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Username or email already taken',
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const player = await Player.create({
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
  });

  const token = signToken(player);

  return res.status(201).json({
    success: true,
    token,
    player: {
      id: player._id,
      username: player.username,
      email: player.email,
    },
  });
}

/**
 * POST /v1/auth/login
 *
 * Body: { email, password }
 * Returns a JWT on success.
 */
export async function login(req, res) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: '`email` and `password` are required',
    });
  }

  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 72) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const player = await Player.findOne({ email: email.toLowerCase().trim() });

  // Always run bcrypt.compare, even for a non-existent account, against a
  // fixed dummy hash — keeps response time constant so it can't be used to
  // enumerate which emails are registered.
  const valid = await bcrypt.compare(password, player ? player.passwordHash : DUMMY_PASSWORD_HASH);

  if (!player || !valid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const token = signToken(player);

  return res.status(200).json({
    success: true,
    token,
    player: {
      id: player._id,
      username: player.username,
      email: player.email,
    },
  });
}
