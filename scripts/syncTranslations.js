import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSLATIONS_DIR = path.resolve(__dirname, '..', 'public', 'translations');
const DEFAULT_OWNER = process.env.TRANSLATIONS_REPO_OWNER || 'EuphoriaTheme';
const DEFAULT_REPO = process.env.TRANSLATIONS_REPO_NAME || 'blueprint-translations';
const DEFAULT_REF = process.env.TRANSLATIONS_REPO_REF || 'main';
const DEFAULT_INTERVAL_MS = Number(process.env.TRANSLATIONS_SYNC_INTERVAL_MS) || 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = Number(process.env.TRANSLATIONS_SYNC_TIMEOUT_MS) || 20000;
const GITHUB_TOKEN = process.env.TRANSLATIONS_SYNC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';

function buildGithubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ED-api-translation-sync'
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  return headers;
}

function isTranslationFile(entry) {
  return entry?.type === 'file'
    && typeof entry.name === 'string'
    && entry.name.endsWith('.json')
    && !entry.name.startsWith('example-')
    && Boolean(entry.download_url);
}

function normalizeJson(rawContent, fileName) {
  try {
    const parsed = JSON.parse(rawContent);
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch (error) {
    throw new Error(`Invalid JSON received for ${fileName}: ${error.message}`);
  }
}

async function fetchRepoTranslationEntries({ owner, repo, ref, timeoutMs }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents`;

  const response = await axios.get(url, {
    params: { ref },
    timeout: timeoutMs,
    headers: buildGithubHeaders(),
    validateStatus: (status) => status >= 200 && status < 300
  });

  if (!Array.isArray(response.data)) {
    throw new Error('GitHub API did not return a directory listing.');
  }

  return response.data
    .filter(isTranslationFile)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchRawFile(downloadUrl, timeoutMs) {
  const response = await axios.get(downloadUrl, {
    timeout: timeoutMs,
    headers: { 'User-Agent': 'ED-api-translation-sync' },
    responseType: 'text',
    transformResponse: [(data) => data],
    validateStatus: (status) => status >= 200 && status < 300
  });

  if (typeof response.data !== 'string') {
    return JSON.stringify(response.data);
  }

  return response.data;
}

export async function syncTranslations(options = {}) {
  const {
    dryRun = false,
    owner = DEFAULT_OWNER,
    repo = DEFAULT_REPO,
    ref = DEFAULT_REF,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    outputDir = TRANSLATIONS_DIR
  } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const entries = await fetchRepoTranslationEntries({ owner, repo, ref, timeoutMs });
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const entry of entries) {
    const targetPath = path.join(outputDir, entry.name);

    try {
      const rawContent = await fetchRawFile(entry.download_url, timeoutMs);
      const normalized = normalizeJson(rawContent, entry.name);
      const exists = fs.existsSync(targetPath);

      if (exists) {
        const current = fs.readFileSync(targetPath, 'utf8');
        if (current === normalized) {
          unchanged += 1;
          continue;
        }
      }

      if (!dryRun) {
        fs.writeFileSync(targetPath, normalized, 'utf8');
      }

      if (exists) {
        updated += 1;
      } else {
        added += 1;
      }

      console.log(`[translation-sync] ${dryRun ? 'Would sync' : 'Synced'} ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`[translation-sync] Failed ${entry.name}: ${error.message}`);
    }
  }

  const result = {
    total: entries.length,
    added,
    updated,
    unchanged,
    failed,
    dryRun,
    owner,
    repo,
    ref,
    outputDir
  };

  const summary = `[translation-sync] Completed${failed ? ' with errors' : ''}: `
    + `${added} added, ${updated} updated, ${unchanged} unchanged, ${failed} failed (total ${entries.length}).`;

  if (failed) {
    console.warn(summary);
  } else {
    console.log(summary);
  }

  return result;
}

export function startTranslationSyncJob(intervalMs = DEFAULT_INTERVAL_MS) {
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      console.warn('[translation-sync] Previous sync still running, skipping this cycle.');
      return;
    }

    isRunning = true;
    try {
      await syncTranslations();
    } catch (error) {
      console.error(`[translation-sync] Sync failed: ${error.message}`);
    } finally {
      isRunning = false;
    }
  };

  run();
  return setInterval(run, intervalMs);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const dryRun = process.argv.includes('--dry-run');

  syncTranslations({ dryRun })
    .then((result) => {
      if (result.failed > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`[translation-sync] Sync failed: ${error.message}`);
      process.exitCode = 1;
    });
}
