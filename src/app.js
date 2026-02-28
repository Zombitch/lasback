import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import hpp from 'hpp';
import pinoHttp from 'pino-http';

import { config } from './utils/configLoader.js';
import { logger } from './utils/logger.js';

import { notFoundHandler } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiKeyAuth } from './middlewares/apiKeyAuth.js';
import { checkOriginAllowed } from './middlewares/checkOriginAllowed.js';

import healthRouter from './routes/health/health.route.js';
import homeRouter from './routes/home/home.route.js';
import dashboardRouter from './routes/dashboard/dashboard.route.js';
import visitRouter from './routes/visit/visit.route.js';
import analyticsRouter from './routes/analytics/analytics.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', [
  path.join(__dirname, 'routes/home'),
  path.join(__dirname, 'routes/dashboard'),
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
    contentSecurityPolicy: false, // we'll tighten CSP later when we know which frontends call us
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

      // reject everything else
      return callback(new Error('Not allowed by CORS'));
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
 * Body parsers
 *
 * Limit body size to reduce DoS risk.
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Routes
 */
app.use('/', homeRouter);
app.use('/health', healthRouter);
app.use('/dashboard', dashboardRouter);

/**
 * Api Key setted up for next route
 */
app.use(apiKeyAuth, checkOriginAllowed);

app.use('/visit', visitRouter);
app.use('/analytics', analyticsRouter);

/**
 * 404 handler (for unmatched routes)
 */
app.use(notFoundHandler);

/**
 * Central error handler (must be last)
 */
app.use(errorHandler);

export default app;
