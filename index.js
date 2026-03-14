import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLUEPRINT_FILE = path.join(__dirname, 'public', 'blueprint.json');
const BLUEPRINT_EXTENSIONS_URL = process.env.BLUEPRINT_EXTENSIONS_URL || 'https://api.blueprintframe.work/api/extensions';
const BLUEPRINT_EXTENSIONS_FALLBACK_URL = process.env.BLUEPRINT_EXTENSIONS_FALLBACK_URL || 'https://blueprint.zip/api/extensions';
const BLUEPRINT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BLUEPRINT_SYNC_USER_AGENT = process.env.BLUEPRINT_SYNC_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const BLUEPRINT_SYNC_CF_CLEARANCE = process.env.BLUEPRINT_SYNC_CF_CLEARANCE || '';
const BLUEPRINT_SYNC_COOKIE = process.env.BLUEPRINT_SYNC_COOKIE || '';
const BLUEPRINT_SYNC_ORIGIN = process.env.BLUEPRINT_SYNC_ORIGIN || 'https://blueprintframe.work';
const BLUEPRINT_SYNC_REFERER = process.env.BLUEPRINT_SYNC_REFERER || 'https://blueprintframe.work/';

function buildBlueprintHeaders() {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': BLUEPRINT_SYNC_USER_AGENT,
    Origin: BLUEPRINT_SYNC_ORIGIN,
    Referer: BLUEPRINT_SYNC_REFERER
  };

  if (BLUEPRINT_SYNC_COOKIE) {
    headers.Cookie = BLUEPRINT_SYNC_COOKIE;
  } else if (BLUEPRINT_SYNC_CF_CLEARANCE) {
    headers.Cookie = `cf_clearance=${BLUEPRINT_SYNC_CF_CLEARANCE}`;
  }

  return headers;
}

async function syncBlueprintExtensions() {
  const urlsToTry = [BLUEPRINT_EXTENSIONS_URL, BLUEPRINT_EXTENSIONS_FALLBACK_URL].filter(Boolean);

  try {
    let response;
    let sourceUrl = '';

    for (const url of urlsToTry) {
      try {
        response = await axios.get(url, {
          timeout: 20000,
          headers: buildBlueprintHeaders(),
          validateStatus: (status) => status >= 200 && status < 300
        });
        sourceUrl = url;
        break;
      } catch (error) {
        const isCloudflareChallenge = String(error?.response?.headers?.['cf-mitigated'] || '').toLowerCase() === 'challenge';
        const message = error?.response
          ? `HTTP ${error.response.status} ${error.response.statusText}`
          : error.message;
        console.warn(`[blueprint-sync] Source failed (${url}): ${isCloudflareChallenge ? 'Cloudflare challenge' : message}`);
      }
    }

    if (!response) {
      throw new Error('All configured Blueprint extension sources failed');
    }

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const isJsonPayload = contentType.includes('application/json') || typeof response.data === 'object';
    if (!isJsonPayload) {
      console.error('[blueprint-sync] Response was not JSON; skipped writing blueprint.json');
      return;
    }

    fs.writeFileSync(BLUEPRINT_FILE, JSON.stringify(response.data, null, 2), 'utf8');
    console.log(`[blueprint-sync] Updated ${BLUEPRINT_FILE} from ${sourceUrl} at ${new Date().toISOString()}`);
  } catch (error) {
    const message = error?.response
      ? `HTTP ${error.response.status} ${error.response.statusText}`
      : error.message;
    const isCloudflareChallenge = String(error?.response?.headers?.['cf-mitigated'] || '').toLowerCase() === 'challenge';
    if (isCloudflareChallenge) {
      console.error('[blueprint-sync] Failed to update blueprint.json: blocked by Cloudflare challenge (set BLUEPRINT_SYNC_COOKIE from a browser session, or use a whitelisted/tokenized API endpoint).');
    } else {
      console.error(`[blueprint-sync] Failed to update blueprint.json: ${message}`);
    }
  }
}

function startBlueprintSyncJob() {
  syncBlueprintExtensions();
  setInterval(syncBlueprintExtensions, BLUEPRINT_SYNC_INTERVAL_MS);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // This parses URL-encoded bodies

// --- Logging and Stats Middleware ---
const statsFile = path.join(__dirname, 'api_stats.json');
function incrementApiCounter() {
  let stats = { count: 0 };
  if (fs.existsSync(statsFile)) {
    try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch {}
  }
  stats.count = (stats.count || 0) + 1;
  fs.writeFileSync(statsFile, JSON.stringify(stats));
}

function logApiCall(req) {
  const now = new Date();
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${now.toISOString().slice(0,10)}.log`);
  const sourceDomain = req.headers['origin'] || req.headers['referer'] || '';
  const sourceIp = req.ip || req.connection?.remoteAddress || '';
  const target = req.originalUrl;
  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null;
  const logEntry = {
    time: now.toISOString(),
    source: { domain: sourceDomain, ip: sourceIp },
    target,
    body
  };
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

app.use((req, res, next) => {
  incrementApiCounter();
  logApiCall(req);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

// Serve static files from /public
app.use('/public', express.static(path.join(__dirname, 'public')));

import licenseRoutes from './routes/license.js';
import gameApiRoutes from './routes/gameapi.js';
import translationApiRoutes from './routes/translations.js';
import productsRoutes from './routes/products.js';
import donatorsRoutes from './routes/donators.js';
import contributorsRoutes from './routes/contributors.js';
import versionsRoutes from './routes/versions.js';
import statsRoutes from './routes/stats.js';
import rconRoutes from './routes/rcon.js';
import { startTranslationSyncJob } from './scripts/syncTranslations.js';

app.use('/license', licenseRoutes);
app.use('/gameapi', gameApiRoutes);
app.use('/translations', translationApiRoutes);
app.use('/products', productsRoutes);
app.use('/donators', donatorsRoutes);
app.use('/contributors', contributorsRoutes);
app.use('/versions', versionsRoutes);
app.use('/stats', statsRoutes);
app.use('/rcon', rconRoutes);

app.get('/', (req, res) => res.send('API Running'));
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    time: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startTranslationSyncJob();
  startBlueprintSyncJob();
});
