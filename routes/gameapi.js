import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import net from 'net';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'url';
import queryFiveMServer from '../handlers/queryFiveMServer.js';
import queryBeamMPServer from '../handlers/queryBeamMPServer.js';
import queryMinecraftServer from '../handlers/queryMinecraftServer.js';
import handleDefaultGame from '../handlers/defaultGameHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gamesPath = path.join(__dirname, '../public/games.yml');
const gameImagesDir = path.join(__dirname, '../public/games');

const PRIVATE_TARGET_BLOCKLIST = new net.BlockList();
PRIVATE_TARGET_BLOCKLIST.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('192.0.0.0', 24, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('192.0.2.0', 24, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('198.18.0.0', 15, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('198.51.100.0', 24, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('203.0.113.0', 24, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('224.0.0.0', 4, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('240.0.0.0', 4, 'ipv4');
PRIVATE_TARGET_BLOCKLIST.addSubnet('::', 128, 'ipv6');
PRIVATE_TARGET_BLOCKLIST.addSubnet('::1', 128, 'ipv6');
PRIVATE_TARGET_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_TARGET_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_TARGET_BLOCKLIST.addSubnet('ff00::', 8, 'ipv6');
PRIVATE_TARGET_BLOCKLIST.addSubnet('2001:db8::', 32, 'ipv6');

const DEFAULT_SPECIAL_GAME_IDS = ['fivem', 'gta5f', 'beammp', 'minecraft'];
const DEFAULT_BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain', 'ip6-localhost', 'broadcasthost'];
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
const DNS_HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?$/i;

const GAMEAPI_RATE_LIMIT_MAX = parseEnvInt(process.env.GAMEAPI_RATE_LIMIT_MAX, 30, { min: 1 });
const GAMEAPI_RATE_LIMIT_TIME_WINDOW = process.env.GAMEAPI_RATE_LIMIT_TIME_WINDOW || '1 minute';
const GAMEAPI_MAX_CONCURRENT_REQUESTS = parseEnvInt(process.env.GAMEAPI_MAX_CONCURRENT_REQUESTS, 50, { min: 1 });
const GAMEAPI_CACHE_TTL_MS = parseEnvInt(process.env.GAMEAPI_CACHE_TTL_MS, 5000, { min: 0 });
const GAMEAPI_GAMES_CACHE_TTL_MS = parseEnvInt(process.env.GAMEAPI_GAMES_CACHE_TTL_MS, 60000, { min: 0 });
const GAMEAPI_DNS_LOOKUP_TIMEOUT_MS = parseEnvInt(process.env.GAMEAPI_DNS_LOOKUP_TIMEOUT_MS, 2500, { min: 100 });
const GAMEAPI_BLOCK_PRIVATE_TARGETS = parseEnvBoolean(process.env.GAMEAPI_BLOCK_PRIVATE_TARGETS, true);
const GAMEAPI_MAX_HOST_LENGTH = parseEnvInt(process.env.GAMEAPI_MAX_HOST_LENGTH, 253, { min: 1, max: 253 });
const GAMEAPI_BLOCKED_HOSTNAMES = new Set(
  parseCsvValues(process.env.GAMEAPI_BLOCKED_HOSTNAMES, DEFAULT_BLOCKED_HOSTNAMES).map((entry) => entry.toLowerCase()),
);
const GAMEAPI_SPECIAL_GAME_IDS = new Set(
  parseCsvValues(process.env.GAMEAPI_SPECIAL_GAME_IDS, DEFAULT_SPECIAL_GAME_IDS).map((entry) => entry.toLowerCase()),
);

const queryResultCache = new Map();
const pendingQueryByTarget = new Map();
let activeQueryCount = 0;

let cachedGames = {
  loadedAt: 0,
  games: {},
  loadedSuccessfully: false,
  gameIdSet: new Set(DEFAULT_SPECIAL_GAME_IDS),
  imageNameByGameId: {},
};

function parseEnvInt(rawValue, fallbackValue, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallbackValue;
  }

  return parsed;
}

function parseEnvBoolean(rawValue, fallbackValue = false) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallbackValue;
  }

  const value = String(rawValue).trim().toLowerCase();
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallbackValue;
}

function parseCsvValues(rawValue, defaults = []) {
  const value = String(rawValue || '').trim();
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : defaults;
}

function parseAndValidatePort(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle = null;
  return Promise.race([
    promise.finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }),
    new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    }),
  ]);
}

function normalizeHost(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > GAMEAPI_MAX_HOST_LENGTH) {
    return null;
  }

  let normalized = raw;

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }

  normalized = normalized.trim();

  if (!normalized) {
    return null;
  }

  if (/[\s/\\?#&%]/.test(normalized) || normalized.includes('://')) {
    return null;
  }

  return normalized;
}

function toLowerHost(host) {
  return host.endsWith('.') ? host.slice(0, -1).toLowerCase() : host.toLowerCase();
}

function getIpv4FromMappedIpv6(ipv6Address) {
  const normalized = ipv6Address.toLowerCase();
  if (!normalized.startsWith('::ffff:')) {
    return null;
  }

  const suffix = normalized.slice('::ffff:'.length);
  if (net.isIP(suffix) === 4) {
    return suffix;
  }

  const mappedParts = suffix.split(':');
  if (mappedParts.length !== 2 || mappedParts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return null;
  }

  const first = Number.parseInt(mappedParts[0], 16);
  const second = Number.parseInt(mappedParts[1], 16);
  return `${(first >> 8) & 255}.${first & 255}.${(second >> 8) & 255}.${second & 255}`;
}

function isBlockedIpAddress(ipAddress) {
  const normalized = String(ipAddress || '').trim();
  if (!normalized) {
    return true;
  }

  const family = net.isIP(normalized);
  if (family === 4) {
    return PRIVATE_TARGET_BLOCKLIST.check(normalized, 'ipv4');
  }

  if (family === 6) {
    const mappedIpv4 = getIpv4FromMappedIpv6(normalized);
    if (mappedIpv4) {
      return PRIVATE_TARGET_BLOCKLIST.check(mappedIpv4, 'ipv4');
    }

    return PRIVATE_TARGET_BLOCKLIST.check(normalized, 'ipv6');
  }

  return true;
}

function loadGamesCache() {
  const now = Date.now();
  if (cachedGames.loadedAt > 0 && GAMEAPI_GAMES_CACHE_TTL_MS > 0 && now - cachedGames.loadedAt < GAMEAPI_GAMES_CACHE_TTL_MS) {
    return cachedGames;
  }

  let games = {};
  let loadedSuccessfully = false;
  try {
    const file = fs.readFileSync(gamesPath, 'utf8');
    games = yaml.load(file) || {};
    loadedSuccessfully = true;
  } catch {
    games = {};
  }

  const gameIdSet = new Set(GAMEAPI_SPECIAL_GAME_IDS);
  const imageNameByGameId = {};

  for (const [, id] of Object.entries(games)) {
    if (typeof id !== 'string') {
      continue;
    }

    const normalizedId = id.trim().toLowerCase();
    if (!normalizedId) {
      continue;
    }

    gameIdSet.add(normalizedId);

    if (!imageNameByGameId[normalizedId]) {
      for (const extension of imageExtensions) {
        const candidate = path.join(gameImagesDir, `${normalizedId}.${extension}`);
        if (fs.existsSync(candidate)) {
          imageNameByGameId[normalizedId] = `${normalizedId}.${extension}`;
          break;
        }
      }
    }
  }

  cachedGames = {
    loadedAt: now,
    games,
    loadedSuccessfully,
    gameIdSet,
    imageNameByGameId,
  };

  return cachedGames;
}

function getQueryCacheEntry(cacheKey) {
  const cached = queryResultCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    queryResultCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setQueryCacheEntry(cacheKey, payload) {
  if (GAMEAPI_CACHE_TTL_MS <= 0) {
    return;
  }

  queryResultCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + GAMEAPI_CACHE_TTL_MS,
  });
}

async function withQueryConcurrencyLimit(fn) {
  if (activeQueryCount >= GAMEAPI_MAX_CONCURRENT_REQUESTS) {
    const error = new Error('Game API is currently at capacity. Please retry shortly.');
    error.statusCode = 429;
    throw error;
  }

  activeQueryCount += 1;
  try {
    return await fn();
  } finally {
    activeQueryCount -= 1;
  }
}

async function resolveQueryTarget(host) {
  const ipFamily = net.isIP(host);
  if (ipFamily !== 0) {
    if (GAMEAPI_BLOCK_PRIVATE_TARGETS && isBlockedIpAddress(host)) {
      const error = new Error('Blocked target host. Private or reserved IP ranges are not allowed.');
      error.statusCode = 400;
      throw error;
    }

    return { queryHost: host, resolvedAddress: host };
  }

  const loweredHost = toLowerHost(host);
  if (!DNS_HOSTNAME_PATTERN.test(loweredHost) || loweredHost.length > GAMEAPI_MAX_HOST_LENGTH) {
    const error = new Error('Invalid ip parameter. Expected a valid hostname or IP value.');
    error.statusCode = 400;
    throw error;
  }

  if (GAMEAPI_BLOCKED_HOSTNAMES.has(loweredHost)) {
    const error = new Error('Blocked target host. Hostname is not allowed.');
    error.statusCode = 400;
    throw error;
  }

  const lookupResults = await withTimeout(
    dns.lookup(loweredHost, { all: true, verbatim: true }),
    GAMEAPI_DNS_LOOKUP_TIMEOUT_MS,
    'Host resolution timed out.',
  );

  if (!Array.isArray(lookupResults) || lookupResults.length === 0) {
    const error = new Error('Could not resolve target host.');
    error.statusCode = 400;
    throw error;
  }

  let selectedAddress = lookupResults[0].address;

  if (GAMEAPI_BLOCK_PRIVATE_TARGETS) {
    const publicAddress = lookupResults.find((result) => !isBlockedIpAddress(result.address));
    if (!publicAddress) {
      const error = new Error('Blocked target host. DNS only resolves to private or reserved IP addresses.');
      error.statusCode = 400;
      throw error;
    }

    selectedAddress = publicAddress.address;
  }

  return {
    queryHost: selectedAddress,
    resolvedAddress: selectedAddress,
  };
}

export default async function registerGameApiRoutes(app) {
  const handleGameListRequest = async (request) => {
    const { games, imageNameByGameId } = loadGamesCache();
    const baseUrl = `${request.protocol || 'https'}://${request.headers.host || 'localhost'}`;
    const gamesWithImages = {};

    for (const [name, id] of Object.entries(games)) {
      const normalizedId = typeof id === 'string' ? id.trim().toLowerCase() : '';
      const imageName = normalizedId ? imageNameByGameId[normalizedId] : null;
      gamesWithImages[name] = {
        id,
        image: imageName ? `${baseUrl}/public/games/${imageName}` : null,
      };
    }

    return gamesWithImages;
  };

  app.get('/', handleGameListRequest);
  app.get('/index', handleGameListRequest);

  app.get('/:game/ip=:ip&port=:port', {
    config: {
      rateLimit: {
        max: GAMEAPI_RATE_LIMIT_MAX,
        timeWindow: GAMEAPI_RATE_LIMIT_TIME_WINDOW,
      },
    },
    schema: {
      params: {
        type: 'object',
        required: ['game', 'ip', 'port'],
        properties: {
          game: { type: 'string', minLength: 1, maxLength: 64 },
          ip: { type: 'string', minLength: 1, maxLength: GAMEAPI_MAX_HOST_LENGTH },
          port: { type: 'string', pattern: '^[0-9]{1,5}$' },
        },
      },
    },
  }, async (request, reply) => {
    const { game, ip, port } = request.params;
    const normalizedGame = String(game || '').trim().toLowerCase();
    const normalizedPort = parseAndValidatePort(port);
    const normalizedHost = normalizeHost(ip);
    let cacheKey = null;
    let pendingOwnedByRequest = false;

    if (!normalizedHost) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid ip parameter. Expected a non-empty hostname/IP value with valid characters.',
      });
    }

    if (normalizedPort === null) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid port parameter. Expected an integer between 1 and 65535.',
      });
    }

    const { gameIdSet, loadedSuccessfully } = loadGamesCache();
    if (loadedSuccessfully && !gameIdSet.has(normalizedGame)) {
      return reply.code(400).send({
        success: false,
        error: `Unsupported game identifier: ${normalizedGame}`,
      });
    }

    try {
      const { queryHost, resolvedAddress } = await resolveQueryTarget(normalizedHost);
      cacheKey = `${normalizedGame}|${resolvedAddress}|${normalizedPort}`;

      const cachedPayload = getQueryCacheEntry(cacheKey);
      if (cachedPayload) {
        return cachedPayload;
      }

      if (pendingQueryByTarget.has(cacheKey)) {
        return await pendingQueryByTarget.get(cacheKey);
      }

      const queryPromise = withQueryConcurrencyLimit(async () => {
        if (['fivem', 'gta5f'].includes(normalizedGame)) {
          return await queryFiveMServer(queryHost, normalizedPort);
        }

        if (normalizedGame === 'beammp') {
          const result = await queryBeamMPServer(queryHost, normalizedPort);
          return { success: true, data: result };
        }

        if (normalizedGame === 'minecraft') {
          return await queryMinecraftServer(queryHost, normalizedPort);
        }

        return await handleDefaultGame(normalizedGame, queryHost, normalizedPort);
      });

      pendingQueryByTarget.set(cacheKey, queryPromise);
      pendingOwnedByRequest = true;
      const result = await queryPromise;
      setQueryCacheEntry(cacheKey, result);
      return result;
    } catch (error) {
      const statusCode = error?.statusCode && Number.isInteger(error.statusCode)
        ? error.statusCode
        : 500;

      if (statusCode >= 500) {
        request.log.error({ err: error }, 'game query failed');
      }

      return reply.code(statusCode).send({
        success: false,
        error: statusCode >= 500 ? 'Failed to query game server.' : error.message,
      });
    } finally {
      if (pendingOwnedByRequest && cacheKey) {
        pendingQueryByTarget.delete(cacheKey);
      }
    }
  });
}
