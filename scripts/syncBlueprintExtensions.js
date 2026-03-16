import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLUEPRINT_FILE = path.resolve(__dirname, '..', 'public', 'blueprint.json');

const BLUEPRINT_EXTENSIONS_URL = process.env.BLUEPRINT_EXTENSIONS_URL || 'https://api.blueprintframe.work/api/extensions';
const BLUEPRINT_EXTENSIONS_FALLBACK_URL = process.env.BLUEPRINT_EXTENSIONS_FALLBACK_URL || 'https://blueprint.zip/api/extensions';
const BLUEPRINT_SYNC_INTERVAL_MS = Number(process.env.BLUEPRINT_SYNC_INTERVAL_MS) || 24 * 60 * 60 * 1000;
const BLUEPRINT_SYNC_USER_AGENT = process.env.BLUEPRINT_SYNC_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const BLUEPRINT_SYNC_CF_CLEARANCE = process.env.BLUEPRINT_SYNC_CF_CLEARANCE || '';
const BLUEPRINT_SYNC_COOKIE = process.env.BLUEPRINT_SYNC_COOKIE || '';
const BLUEPRINT_SYNC_ORIGIN = process.env.BLUEPRINT_SYNC_ORIGIN || 'https://blueprintframe.work';
const BLUEPRINT_SYNC_REFERER = process.env.BLUEPRINT_SYNC_REFERER || 'https://blueprintframe.work/';
const BLUEPRINT_SYNC_TIMEOUT_MS = Number(process.env.BLUEPRINT_SYNC_TIMEOUT_MS) || 20000;

function buildBlueprintHeaders() {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': BLUEPRINT_SYNC_USER_AGENT,
    Origin: BLUEPRINT_SYNC_ORIGIN,
    Referer: BLUEPRINT_SYNC_REFERER,
  };

  if (BLUEPRINT_SYNC_COOKIE) {
    headers.Cookie = BLUEPRINT_SYNC_COOKIE;
  } else if (BLUEPRINT_SYNC_CF_CLEARANCE) {
    headers.Cookie = `cf_clearance=${BLUEPRINT_SYNC_CF_CLEARANCE}`;
  }

  return headers;
}

export async function syncBlueprintExtensions() {
  const urlsToTry = [BLUEPRINT_EXTENSIONS_URL, BLUEPRINT_EXTENSIONS_FALLBACK_URL].filter(Boolean);

  try {
    let response;
    let sourceUrl = '';

    for (const url of urlsToTry) {
      try {
        response = await axios.get(url, {
          timeout: BLUEPRINT_SYNC_TIMEOUT_MS,
          headers: buildBlueprintHeaders(),
          validateStatus: (status) => status >= 200 && status < 300,
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
      return false;
    }

    fs.writeFileSync(BLUEPRINT_FILE, JSON.stringify(response.data, null, 2), 'utf8');
    console.log(`[blueprint-sync] Updated ${BLUEPRINT_FILE} from ${sourceUrl} at ${new Date().toISOString()}`);
    return true;
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
    return false;
  }
}

export function startBlueprintSyncJob(intervalMs = BLUEPRINT_SYNC_INTERVAL_MS) {
  syncBlueprintExtensions();
  return setInterval(syncBlueprintExtensions, intervalMs);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  syncBlueprintExtensions()
    .then((ok) => {
      if (!ok) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`[blueprint-sync] Sync failed: ${error.message}`);
      process.exitCode = 1;
    });
}
