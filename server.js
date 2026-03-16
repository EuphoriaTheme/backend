import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { startTranslationSyncJob } from './scripts/syncTranslations.js';
import { startBlueprintSyncJob } from './scripts/syncBlueprintExtensions.js';
import licenseRoutes from './routes/license.js';
import gameApiRoutes from './routes/gameapi.js';
import translationApiRoutes from './routes/translations.js';
import productsRoutes from './routes/products.js';
import donatorsRoutes from './routes/donators.js';
import contributorsRoutes from './routes/contributors.js';
import versionsRoutes from './routes/versions.js';
import statsRoutes from './routes/stats.js';
import rconRoutes from './routes/rcon.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statsFile = path.join(__dirname, 'api_stats.json');
const logsDir = path.join(__dirname, 'logs');

const REQUEST_BODY_LIMIT_BYTES = Number.parseInt(process.env.REQUEST_BODY_LIMIT_BYTES || '1048576', 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);
const CONNECTION_TIMEOUT_MS = Number.parseInt(process.env.CONNECTION_TIMEOUT_MS || '10000', 10);
const KEEP_ALIVE_TIMEOUT_MS = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS || '5000', 10);
const API_STATS_FLUSH_INTERVAL_MS = Number.parseInt(process.env.API_STATS_FLUSH_INTERVAL_MS || '5000', 10);
const REQUEST_LOGGING_ENABLED = process.env.REQUEST_LOGGING_ENABLED === 'true';
const FASTIFY_LOG_LEVEL = process.env.FASTIFY_LOG_LEVEL || 'info';
const FASTIFY_DISABLE_REQUEST_LOGGING = process.env.FASTIFY_DISABLE_REQUEST_LOGGING !== 'false';
const CORS_ENABLED = process.env.CORS_ENABLED !== 'false';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const CORS_METHODS = String(process.env.CORS_METHODS || 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
  .split(',')
  .map((method) => method.trim().toUpperCase())
  .filter(Boolean);
const PROXY_MODE = String(process.env.PROXY_MODE || 'direct').toLowerCase();
const TRUST_PROXY_HOPS = Number.parseInt(process.env.TRUST_PROXY_HOPS || '1', 10);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || PROXY_MODE !== 'direct';

function normalizeIp(value) {
  const ip = String(value || '').trim();
  return ip.replace(/^::ffff:/, '');
}

function getFirstForwardedFor(request) {
  return normalizeIp(String(request.headers['x-forwarded-for'] || '').split(',')[0]);
}

function resolveClientIp(request) {
  const cloudflareIp = normalizeIp(request.headers['cf-connecting-ip']);
  const trueClientIp = normalizeIp(request.headers['true-client-ip']);
  const realIp = normalizeIp(request.headers['x-real-ip']);
  const forwardedFor = getFirstForwardedFor(request);
  const fastifyIp = normalizeIp(request.ip);
  const socketIp = normalizeIp(request.raw?.socket?.remoteAddress);

  if (PROXY_MODE === 'cloudflare') {
    return cloudflareIp || trueClientIp || realIp || forwardedFor || fastifyIp || socketIp;
  }

  if (PROXY_MODE === 'nginx') {
    return realIp || forwardedFor || fastifyIp || socketIp;
  }

  return fastifyIp || socketIp;
}

const app = Fastify({
  logger: { level: FASTIFY_LOG_LEVEL },
  disableRequestLogging: FASTIFY_DISABLE_REQUEST_LOGGING,
  trustProxy: TRUST_PROXY ? TRUST_PROXY_HOPS : false,
  bodyLimit: REQUEST_BODY_LIMIT_BYTES,
  requestTimeout: REQUEST_TIMEOUT_MS,
  connectionTimeout: CONNECTION_TIMEOUT_MS,
  keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
  routerOptions: {
    maxParamLength: 128,
  },
});

if (CORS_ENABLED) {
  await app.register(fastifyCors, {
    origin: CORS_ORIGIN,
    methods: CORS_METHODS,
  });
}

await app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/public/',
});

function readInitialApiCount() {
  if (!fs.existsSync(statsFile)) {
    return 0;
  }

  try {
    const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    return Number(stats.count) || 0;
  } catch {
    return 0;
  }
}

let apiRequestCount = readInitialApiCount();
let statsDirty = false;
let statsFlushInFlight = false;
let activeLogDate = '';
let activeLogStream = null;
let isShuttingDown = false;

async function flushApiStats() {
  if (!statsDirty || statsFlushInFlight) {
    return;
  }

  statsFlushInFlight = true;
  try {
    await fs.promises.writeFile(statsFile, JSON.stringify({ count: apiRequestCount }), 'utf8');
    statsDirty = false;
  } catch (error) {
    app.log.error({ err: error }, 'failed to flush api stats');
  } finally {
    statsFlushInFlight = false;
  }
}

function incrementApiCounter() {
  apiRequestCount += 1;
  statsDirty = true;
}

function getAccessLogStreamFor(dateKey) {
  if (activeLogStream && activeLogDate === dateKey) {
    return activeLogStream;
  }

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  if (activeLogStream) {
    activeLogStream.end();
  }

  activeLogDate = dateKey;
  activeLogStream = fs.createWriteStream(path.join(logsDir, `${dateKey}.log`), { flags: 'a' });
  activeLogStream.on('error', (error) => {
    app.log.error({ err: error }, 'request access log stream failed');
    try {
      activeLogStream?.end();
    } catch {
      // no-op
    }
    activeLogStream = null;
  });
  return activeLogStream;
}

function logApiCall(request) {
  if (!REQUEST_LOGGING_ENABLED) {
    return;
  }

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const stream = getAccessLogStreamFor(dateKey);

  const sourceDomain = request.headers.origin || request.headers.referer || '';
  const sourceIp = request.clientIp || request.ip || request.raw?.socket?.remoteAddress || '';
  const target = request.raw?.url || request.url || '';

  const logEntry = {
    time: now.toISOString(),
    source: { domain: sourceDomain, ip: sourceIp },
    target,
    body: null,
  };

  stream.write(`${JSON.stringify(logEntry)}\n`);
}

app.addHook('onRequest', async (request) => {
  request.clientIp = resolveClientIp(request);
  incrementApiCounter();
  logApiCall(request);
});

app.addHook('onSend', async (request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').toLowerCase();
  if (forwardedProto === 'https') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return payload;
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'unhandled request error');
  if (!reply.sent) {
    reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500).send({
      success: false,
      error: 'Internal server error',
    });
  }
});

app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    success: false,
    error: 'Route not found',
    path: request.url,
  });
});

await app.register(licenseRoutes, { prefix: '/license' });
await app.register(gameApiRoutes, { prefix: '/gameapi' });
await app.register(translationApiRoutes, { prefix: '/translations' });
await app.register(productsRoutes, { prefix: '/products' });
await app.register(donatorsRoutes, { prefix: '/donators' });
await app.register(contributorsRoutes, { prefix: '/contributors' });
await app.register(versionsRoutes, { prefix: '/versions' });
await app.register(statsRoutes, { prefix: '/stats' });
await app.register(rconRoutes, { prefix: '/rcon' });

app.get('/', async () => 'API Running');
app.get('/health', async () => ({
  ok: true,
  service: 'backend',
  time: new Date().toISOString(),
}));

let jobsStarted = false;
let statsInterval = null;
function startJobs() {
  if (jobsStarted) {
    return;
  }

  jobsStarted = true;
  startTranslationSyncJob();
  startBlueprintSyncJob();

  statsInterval = setInterval(() => {
    flushApiStats();
  }, API_STATS_FLUSH_INTERVAL_MS);

  if (statsInterval.unref) {
    statsInterval.unref();
  }
}

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Fastify server running on ${HOST}:${PORT}`);
    startJobs();
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    app.log.info(`Received ${signal}, shutting down.`);

    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }

    await flushApiStats();
    if (activeLogStream) {
      activeLogStream.end();
      activeLogStream = null;
    }

    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  app.log.error({ err: error }, 'uncaught exception');
  shutdown('uncaughtException');
});
