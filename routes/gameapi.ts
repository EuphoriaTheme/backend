import fs from "fs";
import * as yaml from "js-yaml";
import path from "path";
import net from "net";
import dns from "node:dns/promises";
import { fileURLToPath } from "url";
import queryFiveMServer from "../handlers/queryFiveMServer.js";
import queryBeamMPServer from "../handlers/queryBeamMPServer.js";
import queryMinecraftServer from "../handlers/queryMinecraftServer.js";
import handleDefaultGame from "../handlers/defaultGameHandler.js";
import {
  recordGameCacheHit,
  recordGameCacheMiss,
  recordGameQueryDuration,
  setActiveGameQueries,
} from "../config/runtimeMetrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gamesPath = path.join(__dirname, "../public/games.yml");
const gameImagesDir = path.join(__dirname, "../public/games");

const PRIVATE_TARGET_BLOCKLIST = new net.BlockList();
PRIVATE_TARGET_BLOCKLIST.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("192.0.0.0", 24, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("192.0.2.0", 24, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("198.18.0.0", 15, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("198.51.100.0", 24, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("203.0.113.0", 24, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("224.0.0.0", 4, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("240.0.0.0", 4, "ipv4");
PRIVATE_TARGET_BLOCKLIST.addSubnet("::", 128, "ipv6");
PRIVATE_TARGET_BLOCKLIST.addSubnet("::1", 128, "ipv6");
PRIVATE_TARGET_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
PRIVATE_TARGET_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
PRIVATE_TARGET_BLOCKLIST.addSubnet("ff00::", 8, "ipv6");
PRIVATE_TARGET_BLOCKLIST.addSubnet("2001:db8::", 32, "ipv6");

const DEFAULT_SPECIAL_GAME_IDS = ["fivem", "gta5f", "beammp", "minecraft"];
const DEFAULT_BLOCKED_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "broadcasthost",
];
const imageExtensions = ["webp", "png", "jpg", "jpeg"];
const DNS_HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?$/i;

const GAMEAPI_RATE_LIMIT_MAX = parseEnvInt(
  process.env.GAMEAPI_RATE_LIMIT_MAX,
  30,
  { min: 1 },
);
const GAMEAPI_RATE_LIMIT_TIME_WINDOW =
  process.env.GAMEAPI_RATE_LIMIT_TIME_WINDOW || "1 minute";
const GAMEAPI_MAX_CONCURRENT_REQUESTS = parseEnvInt(
  process.env.GAMEAPI_MAX_CONCURRENT_REQUESTS,
  50,
  { min: 1 },
);
const GAMEAPI_CACHE_TTL_MS = parseEnvInt(
  process.env.GAMEAPI_CACHE_TTL_MS,
  5000,
  { min: 0 },
);
const GAMEAPI_CACHE_MAX_ENTRIES = parseEnvInt(
  process.env.GAMEAPI_CACHE_MAX_ENTRIES,
  500,
  { min: 1 },
);
const GAMEAPI_GAMES_CACHE_TTL_MS = parseEnvInt(
  process.env.GAMEAPI_GAMES_CACHE_TTL_MS,
  60000,
  { min: 0 },
);
const GAMEAPI_DNS_LOOKUP_TIMEOUT_MS = parseEnvInt(
  process.env.GAMEAPI_DNS_LOOKUP_TIMEOUT_MS,
  2500,
  { min: 100 },
);
const GAMEAPI_BLOCK_PRIVATE_TARGETS = parseEnvBoolean(
  process.env.GAMEAPI_BLOCK_PRIVATE_TARGETS,
  true,
);
const GAMEAPI_MAX_HOST_LENGTH = parseEnvInt(
  process.env.GAMEAPI_MAX_HOST_LENGTH,
  253,
  { min: 1, max: 253 },
);
const GAMEAPI_QUERY_BUDGET_MS = parseEnvInt(
  process.env.GAMEAPI_QUERY_BUDGET_MS,
  10000,
  { min: 1000 },
);
const GAMEAPI_BLOCKED_HOSTNAMES = new Set(
  parseCsvValues(
    process.env.GAMEAPI_BLOCKED_HOSTNAMES,
    DEFAULT_BLOCKED_HOSTNAMES,
  ).map((entry) => entry.toLowerCase()),
);
const GAMEAPI_SPECIAL_GAME_IDS = new Set(
  parseCsvValues(
    process.env.GAMEAPI_SPECIAL_GAME_IDS,
    DEFAULT_SPECIAL_GAME_IDS,
  ).map((entry) => entry.toLowerCase()),
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

function parseEnvInt(
  rawValue,
  fallbackValue,
  { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {},
) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallbackValue;
  }

  return parsed;
}

function parseEnvBoolean(rawValue, fallbackValue = false) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallbackValue;
  }

  const value = String(rawValue).trim().toLowerCase();
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallbackValue;
}

function parseCsvValues(rawValue, defaults = []) {
  const value = String(rawValue || "").trim();
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : defaults;
}

function parseAndValidatePort(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function parseLegacyInlineTargetParam(value) {
  const raw = String(value ?? "");
  const marker = "&port=";
  const markerIndex = raw.toLowerCase().lastIndexOf(marker);

  if (markerIndex <= 0) {
    return null;
  }

  const ip = raw.slice(0, markerIndex).trim();
  const port = raw.slice(markerIndex + marker.length).trim();

  if (!ip || !port) {
    return null;
  }

  return { ip, port };
}

function createErrorWithStatus(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isDnsNotFoundError(error) {
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "ENOTFOUND" ||
    code === "ENODATA" ||
    code === "ENOENT" ||
    code === "ENXIO" ||
    code === "NXDOMAIN"
  );
}

function isDnsTemporaryError(error) {
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "EAI_AGAIN" ||
    code === "ETIMEOUT" ||
    code === "ESERVFAIL" ||
    code === "ECONNREFUSED"
  );
}

function toHostResolutionError(error, host) {
  const code = String(error?.code || "").toUpperCase();

  if (isDnsNotFoundError(error)) {
    const notFoundError = createErrorWithStatus(
      `Could not resolve target host: ${host}`,
      400,
    );
    notFoundError.code = code || "ENOTFOUND";
    return notFoundError;
  }

  if (isDnsTemporaryError(error)) {
    const temporaryError = createErrorWithStatus(
      `DNS resolution for "${host}" failed temporarily. Please retry.`,
      503,
    );
    temporaryError.code = code || "EAI_AGAIN";
    return temporaryError;
  }

  const genericError = createErrorWithStatus("Host resolution failed.", 502);
  genericError.code = code || "DNS_ERROR";
  return genericError;
}

function selectPreferredSrvRecord(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  return records.slice().sort((left, right) => {
    const leftPriority = Number.isFinite(left?.priority)
      ? left.priority
      : Number.MAX_SAFE_INTEGER;
    const rightPriority = Number.isFinite(right?.priority)
      ? right.priority
      : Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftWeight = Number.isFinite(left?.weight) ? left.weight : 0;
    const rightWeight = Number.isFinite(right?.weight) ? right.weight : 0;
    return rightWeight - leftWeight;
  })[0];
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
        reject(createErrorWithStatus(timeoutMessage, 504));
      }, timeoutMs);
    }),
  ]);
}

function normalizeHost(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > GAMEAPI_MAX_HOST_LENGTH) {
    return null;
  }

  let normalized = raw;

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  normalized = normalized.trim();

  if (!normalized) {
    return null;
  }

  if (/[\s/\\?#&%]/.test(normalized) || normalized.includes("://")) {
    return null;
  }

  return normalized;
}

function toLowerHost(host) {
  return host.endsWith(".")
    ? host.slice(0, -1).toLowerCase()
    : host.toLowerCase();
}

function getIpv4FromMappedIpv6(ipv6Address) {
  const normalized = ipv6Address.toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return null;
  }

  const suffix = normalized.slice("::ffff:".length);
  if (net.isIP(suffix) === 4) {
    return suffix;
  }

  const mappedParts = suffix.split(":");
  if (
    mappedParts.length !== 2 ||
    mappedParts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }

  const first = Number.parseInt(mappedParts[0], 16);
  const second = Number.parseInt(mappedParts[1], 16);
  return `${(first >> 8) & 255}.${first & 255}.${(second >> 8) & 255}.${second & 255}`;
}

function isBlockedIpAddress(ipAddress) {
  const normalized = String(ipAddress || "").trim();
  if (!normalized) {
    return true;
  }

  const family = net.isIP(normalized);
  if (family === 4) {
    return PRIVATE_TARGET_BLOCKLIST.check(normalized, "ipv4");
  }

  if (family === 6) {
    const mappedIpv4 = getIpv4FromMappedIpv6(normalized);
    if (mappedIpv4) {
      return PRIVATE_TARGET_BLOCKLIST.check(mappedIpv4, "ipv4");
    }

    return PRIVATE_TARGET_BLOCKLIST.check(normalized, "ipv6");
  }

  return true;
}

function loadGamesCache() {
  const now = Date.now();
  if (
    cachedGames.loadedAt > 0 &&
    GAMEAPI_GAMES_CACHE_TTL_MS > 0 &&
    now - cachedGames.loadedAt < GAMEAPI_GAMES_CACHE_TTL_MS
  ) {
    return cachedGames;
  }

  let games;
  let loadedSuccessfully = false;
  try {
    const file = fs.readFileSync(gamesPath, "utf8");
    games = yaml.load(file) || {};
    loadedSuccessfully = true;
  } catch {
    games = {};
  }

  const gameIdSet = new Set(GAMEAPI_SPECIAL_GAME_IDS);
  const imageNameByGameId = {};

  for (const [, id] of Object.entries(games)) {
    if (typeof id !== "string") {
      continue;
    }

    const normalizedId = id.trim().toLowerCase();
    if (!normalizedId) {
      continue;
    }

    gameIdSet.add(normalizedId);

    if (!imageNameByGameId[normalizedId]) {
      for (const extension of imageExtensions) {
        const candidate = path.join(
          gameImagesDir,
          `${normalizedId}.${extension}`,
        );
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

  // Move cache hits to the end of the Map so eviction removes the least
  // recently used entry first.
  queryResultCache.delete(cacheKey);
  queryResultCache.set(cacheKey, cached);
  return cached.payload;
}

function pruneQueryResultCache(now) {
  for (const [key, entry] of queryResultCache) {
    if (entry.expiresAt <= now) {
      queryResultCache.delete(key);
    }
  }

  while (queryResultCache.size >= GAMEAPI_CACHE_MAX_ENTRIES) {
    const oldestKey = queryResultCache.keys().next().value;
    queryResultCache.delete(oldestKey);
  }
}

function setQueryCacheEntry(cacheKey, payload) {
  if (GAMEAPI_CACHE_TTL_MS <= 0) {
    return;
  }

  const now = Date.now();
  queryResultCache.delete(cacheKey);
  pruneQueryResultCache(now);
  queryResultCache.set(cacheKey, {
    payload,
    expiresAt: now + GAMEAPI_CACHE_TTL_MS,
  });
}

async function withQueryConcurrencyLimit(fn) {
  if (activeQueryCount >= GAMEAPI_MAX_CONCURRENT_REQUESTS) {
    const error = new Error(
      "Game API is currently at capacity. Please retry shortly.",
    );
    error.statusCode = 429;
    throw error;
  }

  activeQueryCount += 1;
  setActiveGameQueries(activeQueryCount);
  try {
    return await fn();
  } finally {
    activeQueryCount -= 1;
    setActiveGameQueries(activeQueryCount);
  }
}

async function resolveQueryTarget(
  host,
  { enableMinecraftSrvFallback = false } = {},
) {
  const ipFamily = net.isIP(host);
  if (ipFamily !== 0) {
    if (GAMEAPI_BLOCK_PRIVATE_TARGETS && isBlockedIpAddress(host)) {
      const error = new Error(
        "Blocked target host. Private or reserved IP ranges are not allowed.",
      );
      error.statusCode = 400;
      throw error;
    }

    return { queryHost: host, resolvedAddress: host };
  }

  const loweredHost = toLowerHost(host);
  if (
    !DNS_HOSTNAME_PATTERN.test(loweredHost) ||
    loweredHost.length > GAMEAPI_MAX_HOST_LENGTH
  ) {
    const error = new Error(
      "Invalid ip parameter. Expected a valid hostname or IP value.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (GAMEAPI_BLOCKED_HOSTNAMES.has(loweredHost)) {
    const error = new Error("Blocked target host. Hostname is not allowed.");
    error.statusCode = 400;
    throw error;
  }

  const resolveFromLookupResults = (lookupResults) => {
    if (!Array.isArray(lookupResults) || lookupResults.length === 0) {
      throw createErrorWithStatus(
        `Could not resolve target host: ${loweredHost}`,
        400,
      );
    }

    let selectedAddress = lookupResults[0].address;

    if (GAMEAPI_BLOCK_PRIVATE_TARGETS) {
      const publicAddress = lookupResults.find(
        (result) => !isBlockedIpAddress(result.address),
      );
      if (!publicAddress) {
        throw createErrorWithStatus(
          "Blocked target host. DNS only resolves to private or reserved IP addresses.",
          400,
        );
      }

      selectedAddress = publicAddress.address;
    }

    return {
      queryHost: selectedAddress,
      resolvedAddress: selectedAddress,
      resolvedPort: null,
    };
  };

  const resolveFromHostname = async (hostname) => {
    try {
      const lookupResults = await withTimeout(
        dns.lookup(hostname, { all: true, verbatim: true }),
        GAMEAPI_DNS_LOOKUP_TIMEOUT_MS,
        "Host resolution timed out.",
      );

      return resolveFromLookupResults(lookupResults);
    } catch (error) {
      throw toHostResolutionError(error, hostname);
    }
  };

  try {
    return await resolveFromHostname(loweredHost);
  } catch (error) {
    const canTryMinecraftSrvFallback =
      enableMinecraftSrvFallback && isDnsNotFoundError(error);
    if (!canTryMinecraftSrvFallback) {
      throw error;
    }

    const srvHostname = `_minecraft._tcp.${loweredHost}`;

    try {
      const srvRecords = await withTimeout(
        dns.resolveSrv(srvHostname),
        GAMEAPI_DNS_LOOKUP_TIMEOUT_MS,
        "Host SRV resolution timed out.",
      );
      const selectedSrvRecord = selectPreferredSrvRecord(srvRecords);
      if (!selectedSrvRecord || !selectedSrvRecord.name) {
        throw createErrorWithStatus(
          `Could not resolve target host: ${loweredHost}`,
          400,
        );
      }

      const srvTargetHost = toLowerHost(
        String(selectedSrvRecord.name || "").trim(),
      );
      if (
        !srvTargetHost ||
        !DNS_HOSTNAME_PATTERN.test(srvTargetHost) ||
        srvTargetHost.length > GAMEAPI_MAX_HOST_LENGTH
      ) {
        throw createErrorWithStatus(
          `Could not resolve target host: ${loweredHost}`,
          400,
        );
      }

      if (GAMEAPI_BLOCKED_HOSTNAMES.has(srvTargetHost)) {
        throw createErrorWithStatus(
          "Blocked target host. Hostname is not allowed.",
          400,
        );
      }

      const srvPort = parseAndValidatePort(selectedSrvRecord.port);
      const resolvedTarget = await resolveFromHostname(srvTargetHost);
      return {
        queryHost: resolvedTarget.queryHost,
        resolvedAddress: resolvedTarget.resolvedAddress,
        resolvedPort: srvPort,
      };
    } catch (srvError) {
      throw toHostResolutionError(srvError, loweredHost);
    }
  }
}

export default async function registerGameApiRoutes(app) {
  const handleGameListRequest = async (request) => {
    const { games, imageNameByGameId } = loadGamesCache();
    const baseUrl = `${request.protocol || "https"}://${request.headers.host || "localhost"}`;
    const gamesWithImages = {};

    for (const [name, id] of Object.entries(games)) {
      const normalizedId =
        typeof id === "string" ? id.trim().toLowerCase() : "";
      const imageName = normalizedId ? imageNameByGameId[normalizedId] : null;
      gamesWithImages[name] = {
        id,
        image: imageName ? `${baseUrl}/public/games/${imageName}` : null,
      };
    }

    return gamesWithImages;
  };

  app.get("/", handleGameListRequest);
  app.get("/index", handleGameListRequest);

  app.get(
    "/:game/ip=:ip&port=:port",
    {
      config: {
        rateLimit: {
          max: GAMEAPI_RATE_LIMIT_MAX,
          timeWindow: GAMEAPI_RATE_LIMIT_TIME_WINDOW,
        },
      },
      schema: {
        params: {
          type: "object",
          required: ["game"],
          properties: {
            game: { type: "string", minLength: 1, maxLength: 64 },
            ip: {
              type: "string",
              minLength: 1,
              maxLength: GAMEAPI_MAX_HOST_LENGTH + 16,
            },
            port: { type: "string", pattern: "^[0-9]{1,5}$" },
            "ip&port=:port": {
              type: "string",
              minLength: 1,
              maxLength: GAMEAPI_MAX_HOST_LENGTH + 16,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params || {};
      const { game } = params;
      let ip = params.ip;
      let port = params.port;
      const inlineLegacyTarget = params["ip&port=:port"];

      if ((!ip || !port) && typeof inlineLegacyTarget === "string") {
        const parsedInlineTarget =
          parseLegacyInlineTargetParam(inlineLegacyTarget);
        if (parsedInlineTarget) {
          ip = parsedInlineTarget.ip;
          port = parsedInlineTarget.port;
        }
      }

      const normalizedGame = String(game || "")
        .trim()
        .toLowerCase();
      const normalizedPort = parseAndValidatePort(port);
      const normalizedHost = normalizeHost(ip);
      let cacheKey = null;

      if (!normalizedHost) {
        return reply.code(400).send({
          success: false,
          error:
            "Invalid ip parameter. Expected a non-empty hostname/IP value with valid characters.",
        });
      }

      if (normalizedPort === null) {
        return reply.code(400).send({
          success: false,
          error:
            "Invalid port parameter. Expected an integer between 1 and 65535.",
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
        const { queryHost, resolvedAddress, resolvedPort } =
          await resolveQueryTarget(normalizedHost, {
            enableMinecraftSrvFallback: normalizedGame === "minecraft",
          });
        const effectivePort = resolvedPort ?? normalizedPort;
        cacheKey = `${normalizedGame}|${resolvedAddress}|${effectivePort}`;

        const cachedPayload = getQueryCacheEntry(cacheKey);
        if (cachedPayload) {
          recordGameCacheHit();
          return cachedPayload;
        }
        recordGameCacheMiss();

        if (pendingQueryByTarget.has(cacheKey)) {
          return await withTimeout(
            pendingQueryByTarget.get(cacheKey),
            GAMEAPI_QUERY_BUDGET_MS,
            "Game server query timed out.",
          );
        }

        const queryStartedAt = performance.now();
        const queryPromise = withQueryConcurrencyLimit(async () => {
          if (["fivem", "gta5f"].includes(normalizedGame)) {
            return await queryFiveMServer(queryHost, effectivePort);
          }

          if (normalizedGame === "beammp") {
            const result = await queryBeamMPServer(queryHost, effectivePort);
            return { success: true, data: result };
          }

          if (normalizedGame === "minecraft") {
            return await queryMinecraftServer(queryHost, effectivePort);
          }

          return await handleDefaultGame(
            normalizedGame,
            queryHost,
            effectivePort,
          );
        });

        const pendingQuery = queryPromise
          .then((result) => {
            setQueryCacheEntry(cacheKey, result);
            return result;
          })
          .finally(() => {
            recordGameQueryDuration(performance.now() - queryStartedAt);
            pendingQueryByTarget.delete(cacheKey);
          });
        pendingQueryByTarget.set(cacheKey, pendingQuery);
        const result = await withTimeout(
          pendingQuery,
          GAMEAPI_QUERY_BUDGET_MS,
          "Game server query timed out.",
        );
        return result;
      } catch (error) {
        const statusCode =
          error?.statusCode && Number.isInteger(error.statusCode)
            ? error.statusCode
            : 500;

        if (statusCode >= 500) {
          request.log.error({ err: error }, "game query failed");
        }

        return reply.code(statusCode).send({
          success: false,
          error:
            statusCode >= 500 && statusCode !== 503
              ? "Failed to query game server."
              : error.message,
        });
      }
    },
  );
}
