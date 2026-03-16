import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateLicense } from '../middleware/authenticateLicense.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let versionsCache = null;
let versionsCacheMtimeMs = 0;

function loadVersions() {
  const versionsPath = path.join(__dirname, '../public/versions.yml');
  const stat = fs.statSync(versionsPath);

  if (versionsCache && versionsCacheMtimeMs === stat.mtimeMs) {
    return versionsCache;
  }

  const file = fs.readFileSync(versionsPath, 'utf8');
  const parsed = yaml.load(file) || [];
  versionsCache = parsed;
  versionsCacheMtimeMs = stat.mtimeMs;
  return parsed;
}

export default async function registerVersionsRoutes(app) {
  const handleVersionsRequest = async (request, reply) => {
    const auth = String(request.query?.auth || '').trim();
    const productId = String(request.query?.productId || '').trim();
    const hwid = String(request.query?.hwid || '').trim();

    if (!auth || !productId || !hwid) {
      return reply.code(400).send({ error: 'License key, product ID, and HWID are required.' });
    }

    try {
      const response = await validateLicense({ auth, productId, hwid, version: 'v1' });
      if (!(response.status >= 200 && response.status < 300 && response.data?.status === 200)) {
        return reply.code(response.status >= 400 ? response.status : 403).send({ error: 'Error verifying License Key.' });
      }
    } catch {
      return reply.code(500).send({ error: 'Error verifying License Key.' });
    }

    try {
      return loadVersions();
    } catch {
      return reply.code(500).send({ error: 'Failed to load versions.' });
    }
  };

  app.get('/', handleVersionsRequest);
  app.get('/index', handleVersionsRequest);
}
