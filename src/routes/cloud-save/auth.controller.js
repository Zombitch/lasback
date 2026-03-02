import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Player } from './player.model.js';
import { config } from '../../utils/configLoader.js';

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

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters',
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

  const player = await Player.findOne({ email: email.toLowerCase().trim() });

  if (!player) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const valid = await bcrypt.compare(password, player.passwordHash);

  if (!valid) {
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
