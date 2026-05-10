function parseEnvInt(rawValue, fallbackValue, minValue) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < minValue) {
    return fallbackValue;
  }

  return parsed;
}

export const GAMEQUERY_SOCKET_TIMEOUT_MS = parseEnvInt(process.env.GAMEQUERY_SOCKET_TIMEOUT_MS, 5000, 500);
export const GAMEQUERY_ATTEMPT_TIMEOUT_MS = parseEnvInt(process.env.GAMEQUERY_ATTEMPT_TIMEOUT_MS, 7000, 500);
export const GAMEQUERY_MAX_RETRIES = parseEnvInt(process.env.GAMEQUERY_MAX_RETRIES, 0, 0);
export const FIVEM_HTTP_TIMEOUT_MS = parseEnvInt(process.env.FIVEM_HTTP_TIMEOUT_MS, 5000, 500);
export const FIVEM_MAX_RESPONSE_BYTES = parseEnvInt(process.env.FIVEM_MAX_RESPONSE_BYTES, 1048576, 1024);
