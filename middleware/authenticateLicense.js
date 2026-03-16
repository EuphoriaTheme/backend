import axios from 'axios';
import http from 'http';
import https from 'https';

const LICENSE_API_V1_URL = process.env.LICENSE_API_V1_URL || 'https://license.euphoriadevelopment.uk/api/v1/validate';
const LICENSE_API_V2_URL = process.env.LICENSE_API_V2_URL || 'https://licensing.euphoriadevelopment.uk/api/licenses/validate';
const LICENSE_API_TIMEOUT_MS = Number.parseInt(process.env.LICENSE_API_TIMEOUT_MS || '10000', 10);
const LICENSE_API_MAX_RETRIES = Number.parseInt(process.env.LICENSE_API_MAX_RETRIES || '1', 10);

const licenseHttpClient = axios.create({
  timeout: LICENSE_API_TIMEOUT_MS,
  validateStatus: () => true,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 128 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 128 }),
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

function sanitizeField(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function shouldRetryNetworkError(error) {
  if (!error || error.response) {
    return false;
  }

  return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(error.code);
}

export async function validateLicense({ auth, productId, hwid, ip, version = 'v1' }) {
  const normalizedVersion = version === 'v2' ? 'v2' : 'v1';
  const endpoint = normalizedVersion === 'v2' ? LICENSE_API_V2_URL : LICENSE_API_V1_URL;
  const normalizedAuth = sanitizeField(auth, 128);
  const normalizedProductId = sanitizeField(productId, 64);
  const normalizedHwid = sanitizeField(hwid, 128);

  if (!normalizedAuth || !normalizedProductId || !normalizedHwid) {
    throw new Error('license payload is missing required fields');
  }

  const payload = {
    licenseKey: normalizedAuth,
    productId: normalizedProductId,
    hwid: normalizedHwid,
  };

  if (normalizedVersion === 'v2' && ip) {
    payload.ip = sanitizeField(ip, 64);
  }

  for (let attempt = 0; attempt <= LICENSE_API_MAX_RETRIES; attempt += 1) {
    try {
      return await licenseHttpClient.post(endpoint, payload);
    } catch (error) {
      if (attempt < LICENSE_API_MAX_RETRIES && shouldRetryNetworkError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('license verification request failed');
}