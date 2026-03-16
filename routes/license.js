import { validateLicense } from '../middleware/authenticateLicense.js';

const LICENSE_KEY_REGEX = /^[A-Z0-9-]{8,64}$/;

function isValidIp(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  // Accept IPv4 and simple IPv6 forms used by clients/proxies.
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(value.trim()) || ipv6.test(value.trim());
}

function resolveClientIp(request) {
  const fromDecoratedRequest = String(request.clientIp || '').trim();
  if (fromDecoratedRequest) {
    return fromDecoratedRequest.replace(/^::ffff:/, '');
  }

  const cloudflareIp = String(request.headers['cf-connecting-ip'] || '').trim();
  if (cloudflareIp) {
    return cloudflareIp.replace(/^::ffff:/, '');
  }

  const trueClientIp = String(request.headers['true-client-ip'] || '').trim();
  if (trueClientIp) {
    return trueClientIp.replace(/^::ffff:/, '');
  }

  const realIp = String(request.headers['x-real-ip'] || '').trim();
  if (realIp) {
    return realIp.replace(/^::ffff:/, '');
  }

  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const fromSocket = request.raw?.socket?.remoteAddress || '';
  const candidate = forwarded || request.ip || fromSocket || '';
  return String(candidate).replace(/^::ffff:/, '').trim();
}

function validateV2Payload(body, effectiveIp) {
  if (!body || typeof body !== 'object') {
    return 'Request body is required.';
  }

  const { licenseKey, productId, hwid } = body;

  if (typeof licenseKey !== 'string' || !LICENSE_KEY_REGEX.test(licenseKey.trim().toUpperCase())) {
    return 'licenseKey must be a string in key format (letters, numbers, dashes).';
  }

  const normalizedProductId = String(productId ?? '').trim();
  if (!normalizedProductId || normalizedProductId.length > 64) {
    return 'productId is required and must be 64 characters or fewer.';
  }

  if (typeof hwid !== 'string' || !hwid.trim() || hwid.trim().length > 128) {
    return 'hwid is required and must be 128 characters or fewer.';
  }

  if (!effectiveIp || !isValidIp(String(effectiveIp))) {
    return 'ip must be a valid IPv4 or IPv6 address.';
  }

  return null;
}

function validateV1Payload(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body is required.';
  }

  const { licenseKey, productId, hwid } = body;

  if (typeof licenseKey !== 'string' || !LICENSE_KEY_REGEX.test(licenseKey.trim().toUpperCase())) {
    return 'licenseKey must be a string in key format (letters, numbers, dashes).';
  }

  const normalizedProductId = String(productId ?? '').trim();
  if (!normalizedProductId || normalizedProductId.length > 64) {
    return 'productId is required and must be 64 characters or fewer.';
  }

  if (typeof hwid !== 'string' || !hwid.trim() || hwid.trim().length > 128) {
    return 'hwid is required and must be 128 characters or fewer.';
  }

  return null;
}

export default async function registerLicenseRoutes(app) {
  app.post('/verify-license', async (request, reply) => {
    const validationError = validateV1Payload(request.body);
    if (validationError) {
      return reply.code(400).send({ success: false, error: validationError });
    }

    const { licenseKey, productId, hwid } = request.body;

    try {
      const response = await validateLicense({
        auth: String(licenseKey).trim(),
        productId: String(productId).trim(),
        hwid: String(hwid).trim(),
        version: 'v1',
      });

      if (response.status >= 200 && response.status < 300 && response.data?.status === 200) {
        return { success: true, message: 'License is valid.' };
      }

      return reply.code(response.status >= 400 ? response.status : 403).send({
        success: false,
        error: response.data?.error || response.data?.message || 'Invalid License Key.',
      });
    } catch (error) {
      request.log.error({ err: error }, 'license v1 validation error');
      return reply.code(502).send({ success: false, error: 'License provider request failed.' });
    }
  });

  app.post('/v2/verify-license', async (request, reply) => {
    const effectiveIp = request.body?.ip ? String(request.body.ip).trim() : resolveClientIp(request);
    const validationError = validateV2Payload(request.body, effectiveIp);
    if (validationError) {
      return reply.code(400).send({ success: false, error: validationError });
    }

    const { licenseKey, productId, hwid } = request.body;

    try {
      const response = await validateLicense({
        auth: licenseKey.trim(),
        productId: String(productId).trim(),
        hwid: hwid.trim(),
        ip: effectiveIp,
        version: 'v2',
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true, message: 'License is valid.' };
      }

      const errorMessage = response.data?.error || response.data?.message || 'License verification failed.';
      return reply.code(response.status).send({ success: false, error: errorMessage, details: response.data || null });
    } catch (error) {
      request.log.error({ err: error }, 'license v2 validation error');
      return reply.code(502).send({ success: false, error: 'License provider request failed.' });
    }
  });
}