import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import session from 'express-session';

import { config } from './utils/configLoader.js';
import { logger } from './utils/logger.js';

import { notFoundHandler } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiKeyAuth } from './middlewares/apiKeyAuth.js';
import { checkOriginAllowed } from './middlewares/checkOriginAllowed.js';
import { totpAuth } from './middlewares/totpAuth.js';
import { playerAuth } from './middlewares/playerAuth.js';

import healthRouter from './routes/health/health.route.js';
import homeRouter from './routes/home/home.route.js';
import dashboardRouter from './routes/dashboard/dashboard.route.js';
import totpRouter from './routes/totp/totp.route.js';
import visitRouter from './routes/visit/visit.route.js';
import analyticsRouter from './routes/analytics/analytics.route.js';

import cloudSaveAuthRouter from './routes/cloud-save/auth.route.js';
import cloudSaveRouter from './routes/cloud-save/saves.route.js';
import adminSavesRouter from './routes/cloud-save/admin-saves.route.js';
import dashboardSavesRouter from './routes/cloud-save/dashboard-saves.route.js';

import featureInterruptorRouter from './routes/feature-interruptor/feature-interruptor.route.js';
import adminFeatureInterruptorRouter from './routes/feature-interruptor/admin-feature-interruptor.route.js';
import dashboardFeatureInterruptorRouter from './routes/feature-interruptor/dashboard-feature-interruptor.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.locals.env = config.env;

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', [
  path.join(__dirname, 'routes/home'),
  path.join(__dirname, 'routes/dashboard'),
  path.join(__dirname, 'routes/totp'),
  path.join(__dirname, 'routes/cloud-save'),
  path.join(__dirname, 'routes/feature-interruptor'),
]);

/**
 * Logging (must be first so we see all requests, even ones that 4xx/5xx early)
 *//*
app.use(
  pinoHttp({
    logger,
    customSuccessMessage: function (req, res) {
      return `${req.method} ${req.url} -> ${res.statusCode}`;
    },
    customErrorMessage: function (req, res, err) {
      return `request errored: ${req.method} ${req.url} -> ${res.statusCode} (${err.message})`;
    },
    serializers: {
      req: (req) => ({
        method: req.method + " " + req.url,
        headers:{
          "user-agent": req.headers['user-agent'],
          "x-real-ip": req.headers['x-real-ip']
        }
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  })
);*/

/**
 * Security headers
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // inline scripts used by feature interruptor dashboard
        styleSrc: ["'self'", "'unsafe-inline'"], // inline styles used by dashboard templates
        imgSrc: ["'self'", 'data:'], // data: required for TOTP QR code rendering
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

/**
 * CORS policy
 *
 * Only allow known origins. In prod, this should be your frontend domain(s).
 */
app.use(
  cors({
    origin: function (origin, callback) {
      // allow non-browser tools like curl / Postman (no origin header)
      if (!origin) return callback(null, true);

      if (config.corsAllowedOrigins.includes(origin) || config.corsAllowedOrigins.includes("*")) {
        return callback(null, true);
      }

      // Don't set CORS headers for unlisted origins.
      // The browser will block cross-origin JS reads (no Access-Control-Allow-Origin),
      // but same-origin and form submissions still work normally.
      return callback(null, false);
    },
    credentials: true,
  })
);

/**
 * Rate limiting
 *
 * Helps against brute force and basic abuse.
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/**
 * Prevent HTTP Parameter Pollution
 */
app.use(hpp());

/**
 * Gzip/deflate responses
 */
app.use(compression());

/**
 * Cloud Save player routes — mounted BEFORE the global 10 kb body parser
 * so save payloads up to 256 KB are accepted.
 *
 * Auth routes keep the standard 10 kb limit.
 * Save routes get a 256 kb limit for game payloads.
 * Both require an API key + allowed origin; save routes also require a JWT.
 */
app.use(
  '/v1/auth',
  express.json({ limit: '10kb' }),
  apiKeyAuth,
  checkOriginAllowed,
  cloudSaveAuthRouter,
);
app.use(
  '/v1/games',
  express.json({ limit: '256kb' }),
  apiKeyAuth,
  checkOriginAllowed,
  playerAuth,
  cloudSaveRouter,
);

/**
 * Body parsers
 *
 * Limit body size to reduce DoS risk.
 * (Cloud save routes above have their own larger parser.)
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Session (required for TOTP verification state)
 */
app.use(
  session({
    name: '__las_sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 h
    },
  })
);

/**
 * Routes
 */

// TOTP pages (setup & verify) are public — they handle their own access logic
app.use('/totp', totpRouter);

// Health check (JSON, no view) — no TOTP gate
app.use('/health', healthRouter);

// API routes are protected by API key/origin checks and must not require TOTP
app.use('/visit', apiKeyAuth, checkOriginAllowed, visitRouter);
app.use('/analytics', apiKeyAuth, checkOriginAllowed, analyticsRouter);
app.use('/feature-interruptor', apiKeyAuth, checkOriginAllowed, featureInterruptorRouter);

// Admin JSON API (TOTP protected)
app.use('/admin', totpAuth, adminSavesRouter);
app.use('/admin', totpAuth, adminFeatureInterruptorRouter);

// All view routes are protected by TOTP
app.use('/', totpAuth, homeRouter);
app.use('/dashboard/saves', totpAuth, dashboardSavesRouter);
app.use('/dashboard/feature-interruptors', totpAuth, dashboardFeatureInterruptorRouter);
app.use('/dashboard', totpAuth, dashboardRouter);

/**
 * 404 handler (for unmatched routes)
 */
app.use(notFoundHandler);

/**
 * Central error handler (must be last)
 */
app.use(errorHandler);

export default app;
