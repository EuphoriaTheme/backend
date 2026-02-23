import express from 'express';
import { Rcon as MinecraftRcon } from 'rcon-client';
import * as RconSrcdsModule from 'rcon-srcds';
import { createRequire } from 'module';
import net from 'net';

const router = express.Router();
const require = createRequire(import.meta.url);

const toSafeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizePort = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return null;
  return parsed;
};

const measureTcpPing = (host, port, timeoutMs = 2500) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const startedAt = Date.now();
    let settled = false;

    const finalize = (value = null) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // no-op
      }
      resolve(value);
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      const latency = Date.now() - startedAt;
      finalize(Number.isFinite(latency) && latency >= 0 ? latency : null);
    });

    socket.once('timeout', () => finalize(null));
    socket.once('error', () => finalize(null));

    try {
      socket.connect(port, host);
    } catch {
      finalize(null);
    }
  });
};

const withTimeout = async (promise, timeoutMs, errorMessage) => {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const normalizeRconError = (error) => {
  const rawMessage = String(error?.message || '').trim();

  if (/The "string" argument must be of type string/i.test(rawMessage)) {
    return 'RCON command payload was invalid. Ensure a valid command string is being sent.';
  }

  if (/failed all\s+\d+\s+attempts/i.test(rawMessage)) {
    return 'RCON authentication/connection failed after retries. Verify host, port, password, RCON type, and firewall rules allowing the API server IP.';
  }

  if (/timed out|i\/o timeout|etimedout/i.test(rawMessage)) {
    return 'RCON connection timed out. Verify the RCON port is open and reachable from the API server host.';
  }

  if (/auth|authenticate|password|login/i.test(rawMessage)) {
    return 'RCON authentication failed. Verify the RCON password and type.';
  }

  return rawMessage || 'RCON request failed.';
};

const resolveSourceRconCandidates = () => {
  let requiredModule = null;
  try {
    requiredModule = require('rcon-srcds');
  } catch {
    // ignore and continue probing import-based module
  }

  const candidates = [
    RconSrcdsModule?.default,
    RconSrcdsModule?.Rcon,
    RconSrcdsModule?.RCON,
    requiredModule?.default,
    requiredModule?.Rcon,
    requiredModule?.RCON,
    requiredModule,
  ].filter(Boolean);

  return candidates;
};

const isValidSourceClient = (client) => {
  return Boolean(client)
    && typeof client.authenticate === 'function'
    && typeof client.execute === 'function';
};

const createSourceRconClient = (options) => {
  const candidates = resolveSourceRconCandidates();
  const errors = [];

  for (const candidate of candidates) {
    if (typeof candidate !== 'function') continue;

    try {
      const constructed = new candidate(options);
      if (isValidSourceClient(constructed)) {
        return constructed;
      }
    } catch (error) {
      errors.push(String(error?.message || error));
    }

    try {
      const created = candidate(options);
      if (isValidSourceClient(created)) {
        return created;
      }
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }

  throw new Error(`Failed to initialize rcon-srcds client. ${errors.find(Boolean) || 'No valid export found.'}`);
};

const parseVariableLines = (output) => {
  const variables = {};

  String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const equalsIndex = line.indexOf('=');
      const colonIndex = line.indexOf(':');

      if (equalsIndex > 0) {
        const key = line.slice(0, equalsIndex).trim();
        const value = line.slice(equalsIndex + 1).trim();
        if (key) variables[key] = value;
        return;
      }

      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key) variables[key] = value;
      }
    });

  return variables;
};

const normalizeGameId = (value) => toSafeString(value).toLowerCase();

const defaultPlayerCommandForGame = (gameId) => {
  const normalized = normalizeGameId(gameId);

  if (['rust'].includes(normalized)) return 'players';
  if (['asa', 'ase', 'ark', 'arksa', 'arkse'].includes(normalized)) return 'ListPlayers';
  if (['sdtd', '7dtd', '7daystodie'].includes(normalized)) return 'listplayers';

  return 'status';
};

const parseIntegerFromValue = (value) => {
  const match = String(value ?? '').match(/-?\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRatioFromValue = (value) => {
  const match = String(value ?? '').match(/(\d+)\s*[\/|]\s*(\d+)/);
  if (!match) return null;

  const current = Number.parseInt(match[1], 10);
  const max = Number.parseInt(match[2], 10);
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;

  return { current, max };
};

const deriveCountsFromVariables = (variables, rawOutput = '') => {
  const entries = Object.entries(variables || {});
  const normalizedMap = new Map(entries.map(([key, value]) => [String(key).toLowerCase(), String(value ?? '')]));

  const ratioKeys = ['players', 'playercount', 'numplayers'];
  for (const key of ratioKeys) {
    const ratio = parseRatioFromValue(normalizedMap.get(key));
    if (ratio) {
      return {
        numplayers: ratio.current,
        maxplayers: ratio.max,
      };
    }
  }

  const currentKeys = ['numplayers', 'playercount', 'players', 'currentplayers', 'onlineplayers'];
  const maxKeys = ['maxplayers', 'maxplayercount', 'maxclients', 'sv_maxplayers', 'max_players'];

  let current = null;
  let max = null;

  for (const key of currentKeys) {
    const parsed = parseIntegerFromValue(normalizedMap.get(key));
    if (parsed !== null) {
      current = parsed;
      break;
    }
  }

  for (const key of maxKeys) {
    const parsed = parseIntegerFromValue(normalizedMap.get(key));
    if (parsed !== null) {
      max = parsed;
      break;
    }
  }

  const result = {
    numplayers: current,
    maxplayers: max,
  };

  if (result.numplayers !== null && result.maxplayers !== null) {
    return result;
  }

  const lines = String(rawOutput || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const connectedRatio = line.match(/connected\s+players?\D+(\d+)\s*[\/|]\s*(\d+)/i);
    if (connectedRatio) {
      return {
        numplayers: Number.parseInt(connectedRatio[1], 10),
        maxplayers: Number.parseInt(connectedRatio[2], 10),
      };
    }

    const playersRatio = line.match(/players?\D+(\d+)\s*[\/|]\s*(\d+)/i);
    if (playersRatio) {
      return {
        numplayers: Number.parseInt(playersRatio[1], 10),
        maxplayers: Number.parseInt(playersRatio[2], 10),
      };
    }

    if (result.maxplayers === null) {
      const maxPlayersMatch = line.match(/max\s*players?\D+(\d+)/i);
      if (maxPlayersMatch) {
        result.maxplayers = Number.parseInt(maxPlayersMatch[1], 10);
      }
    }

    if (result.numplayers === null) {
      const currentPlayersMatch = line.match(/(?:current|online|connected)\s*players?\D+(\d+)/i);
      if (currentPlayersMatch) {
        result.numplayers = Number.parseInt(currentPlayersMatch[1], 10);
      }
    }
  }

  return result;
};

const shouldPreferVariableCounts = (gameId) => {
  const normalized = normalizeGameId(gameId);
  return ['asa', 'ase', 'ark', 'arksa', 'arkse', 'rust', 'sdtd', '7dtd', '7daystodie'].includes(normalized);
};

const parseSourceStatusPlayers = (output) => {
  const players = [];

  String(output || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*#\s*\d+\s+"([^"]+)"\s+([^\s]+)\s+(\d+)\s+([\d:]+)\s+(\d+)\s+(\d+)/);
      if (!match) return;

      players.push({
        name: match[1],
        uuid: match[2],
        ping: Number.parseInt(match[5], 10) || null,
      });
    });

  return players;
};

const parseRustPlayers = (output) => {
  const players = [];

  String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const quotedNameMatch = line.match(/^(\d{10,20})\s+"([^"]+)"\s+\d+/);
      if (quotedNameMatch) {
        players.push({
          name: quotedNameMatch[2],
          uuid: quotedNameMatch[1],
          ping: null,
        });
        return;
      }

      const basicMatch = line.match(/^(\d{10,20})\s+([^\s].+?)\s+\d+\s+/);
      if (basicMatch) {
        players.push({
          name: basicMatch[2].trim(),
          uuid: basicMatch[1],
          ping: null,
        });
      }
    });

  return players;
};

const parseArkPlayers = (output) => {
  const players = [];

  String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      // Format seen in ARK/ASA: "0. PlayerName, 00029b3b6e9543d2914afd4691adcde7"
      const indexedNameUuidMatch = line.match(/^\d+\.\s*(.+?)\s*,\s*([a-fA-F0-9]{32,36})\s*$/);
      if (indexedNameUuidMatch) {
        players.push({
          name: indexedNameUuidMatch[1].trim(),
          uuid: indexedNameUuidMatch[2].trim(),
          ping: null,
        });
        return;
      }

      // Alternate format: "<id>, <name>"
      const idNameMatch = line.match(/^(\d{5,20})\s*,\s*(.+)$/);
      if (idNameMatch) {
        players.push({
          name: idNameMatch[2].trim(),
          uuid: idNameMatch[1].trim(),
          ping: null,
        });
      }
    });

  return players;
};

const parseGenericPlayers = (output) => {
  const players = [];

  String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      if (/^hostname|^version|^map|^players\s*:/i.test(line)) return;
      if (/^id\s+name\s+/i.test(line)) return;
      if (/no players?/i.test(line)) return;
      if (/^keep\s+alive$/i.test(line)) return;

      const commaName = line.match(/^\d+\s*,\s*(.+)$/);
      const name = commaName ? commaName[1].trim() : line;

      if (!name) return;
      players.push({
        name,
        uuid: `rcon-${index + 1}`,
        ping: null,
      });
    });

  return players;
};

const parsePlayersByGame = ({ gameId, command, output }) => {
  const normalizedGame = normalizeGameId(gameId);
  const normalizedCommand = toSafeString(command).toLowerCase();

  if (normalizedGame === 'rust' || normalizedCommand === 'players') {
    return parseRustPlayers(output);
  }

  if (['asa', 'ase', 'ark', 'arksa', 'arkse'].includes(normalizedGame) || normalizedCommand === 'listplayers') {
    return parseArkPlayers(output);
  }

  const sourceStatusPlayers = parseSourceStatusPlayers(output);
  if (sourceStatusPlayers.length > 0) {
    return sourceStatusPlayers;
  }

  return parseGenericPlayers(output);
};

const getPlayerCommandCandidates = (gameId, requestedCommand) => {
  const normalizedGame = normalizeGameId(gameId);
  const primary = toSafeString(requestedCommand) || defaultPlayerCommandForGame(gameId);
  const candidates = [primary];

  if (['asa', 'ase', 'ark', 'arksa', 'arkse'].includes(normalizedGame)) {
    candidates.push('ListPlayers', 'listplayers');
  }

  const unique = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const value = toSafeString(candidate);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }

  return unique;
};

const callMinecraftRcon = async ({ host, port, password, command }) => {
  const safeCommand = toSafeString(command);
  if (!safeCommand) {
    throw new Error('RCON command is required.');
  }

  const client = await withTimeout(
    MinecraftRcon.connect({
      host,
      port,
      password,
      timeout: 8000,
    }),
    9000,
    'RCON connection timed out.'
  );

  try {
    const response = await withTimeout(
      client.send(safeCommand),
      9000,
      'RCON command timed out.'
    );
    return response;
  } finally {
    try {
      await client.end();
    } catch {
      // no-op
    }
  }
};

const callSourceRcon = async ({ host, port, password, command }) => {
  const safeCommand = toSafeString(command);
  if (!safeCommand) {
    throw new Error('RCON command is required.');
  }

  const client = createSourceRconClient({
    host,
    port,
    encoding: 'utf8',
    timeout: 8000,
  });

  try {
    await withTimeout(
      client.authenticate(password),
      9000,
      'RCON authentication timed out.'
    );

    const response = await withTimeout(
      client.execute(safeCommand),
      9000,
      'RCON command timed out.'
    );
    return response;
  } finally {
    try {
      if (typeof client.disconnect === 'function') {
        await client.disconnect();
      } else if (typeof client.end === 'function') {
        await client.end();
      } else if (typeof client.close === 'function') {
        await client.close();
      }
    } catch {
      // no-op
    }
  }
};

router.get('/health', (req, res) => {
  return res.json({
    success: true,
    service: 'rcon',
    time: new Date().toISOString(),
  });
});

router.post('/variables', async (req, res) => {
  const host = toSafeString(req.body?.host);
  const password = toSafeString(req.body?.password);
  const port = normalizePort(req.body?.port);
  const type = toSafeString(req.body?.type).toLowerCase() || 'source';
  const command = toSafeString(req.body?.command) || 'status';

  if (!host) {
    return res.status(400).json({ success: false, error: 'Host is required.' });
  }

  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required.' });
  }

  if (!port) {
    return res.status(400).json({ success: false, error: 'A valid port is required.' });
  }

  try {
    const output = type === 'minecraft'
      ? await callMinecraftRcon({ host, port, password, command })
      : await callSourceRcon({ host, port, password, command });

    const variables = parseVariableLines(output);

    return res.json({
      success: true,
      type,
      command,
      output,
      variables,
    });
  } catch (error) {
    return res.json({
      success: false,
      error: normalizeRconError(error),
      detail: String(error?.message || ''),
      code: 'RCON_REQUEST_FAILED',
    });
  }
});

router.post('/players', async (req, res) => {
  const host = toSafeString(req.body?.host);
  const password = toSafeString(req.body?.password);
  const port = normalizePort(req.body?.port);
  const type = toSafeString(req.body?.type).toLowerCase() || 'source';
  const game = normalizeGameId(req.body?.game);
  const requestedCommand = toSafeString(req.body?.command);
  const countCommand = toSafeString(req.body?.count_command) || 'status';
  const requestedMaxPlayersFallback = Number.parseInt(String(req.body?.maxplayers_fallback ?? ''), 10);
  const maxPlayersFallback = Number.isFinite(requestedMaxPlayersFallback) && requestedMaxPlayersFallback > 0
    ? requestedMaxPlayersFallback
    : null;

  if (!host) {
    return res.status(400).json({ success: false, error: 'Host is required.' });
  }

  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required.' });
  }

  if (!port) {
    return res.status(400).json({ success: false, error: 'A valid port is required.' });
  }

  try {
    const commandCandidates = getPlayerCommandCandidates(game, requestedCommand);
    let output = '';
    let commandUsed = commandCandidates[0] || defaultPlayerCommandForGame(game);
    let players = [];
    let derivedNumPlayers = null;
    let derivedMaxPlayers = null;

    const deriveCountsFromCommand = async (commandToRun) => {
      const safeCommand = toSafeString(commandToRun);
      if (!safeCommand) return { numplayers: null, maxplayers: null };

      const countOutput = type === 'minecraft'
        ? await callMinecraftRcon({ host, port, password, command: safeCommand })
        : await callSourceRcon({ host, port, password, command: safeCommand });

      const variables = parseVariableLines(countOutput);
      return deriveCountsFromVariables(variables, countOutput);
    };

    for (const candidate of commandCandidates) {
      const candidateCommand = toSafeString(candidate);
      if (!candidateCommand) continue;

      const candidateOutput = type === 'minecraft'
        ? await callMinecraftRcon({ host, port, password, command: candidateCommand })
        : await callSourceRcon({ host, port, password, command: candidateCommand });

      const parsedPlayers = parsePlayersByGame({ gameId: game, command: candidateCommand, output: candidateOutput });
      const normalizedOutput = String(candidateOutput || '').trim();
      const isKeepAliveOnly = /^keep\s+alive$/i.test(normalizedOutput);

      output = candidateOutput;
      commandUsed = candidateCommand;
      players = parsedPlayers;

      if (parsedPlayers.length > 0 || !isKeepAliveOnly) {
        break;
      }
    }

    try {
      const primaryCounts = await deriveCountsFromCommand(countCommand);
      derivedNumPlayers = primaryCounts.numplayers;
      derivedMaxPlayers = primaryCounts.maxplayers;

      const shouldRetryWithStatus = toSafeString(countCommand).toLowerCase() !== 'status'
        && (derivedNumPlayers === null || derivedMaxPlayers === null || derivedMaxPlayers <= 0);

      if (shouldRetryWithStatus) {
        const fallbackCounts = await deriveCountsFromCommand('status');
        if (fallbackCounts.numplayers !== null && (derivedNumPlayers === null || derivedNumPlayers <= 0)) {
          derivedNumPlayers = fallbackCounts.numplayers;
        }
        if (fallbackCounts.maxplayers !== null && (derivedMaxPlayers === null || derivedMaxPlayers <= 0)) {
          derivedMaxPlayers = fallbackCounts.maxplayers;
        }
      }
    } catch {
      // Best-effort: keep player list response even if count command fails.
    }

    if (!commandUsed) {
      throw new Error('No valid RCON command candidate was available.');
    }

    const parsedPlayersCount = Array.isArray(players) ? players.length : 0;
    const normalizedDerivedNumPlayers = Number.isFinite(derivedNumPlayers) ? derivedNumPlayers : null;
    const normalizedDerivedMaxPlayers = Number.isFinite(derivedMaxPlayers) && derivedMaxPlayers > 0
      ? derivedMaxPlayers
      : null;
    const resolvedNumPlayers =
      normalizedDerivedNumPlayers !== null && normalizedDerivedNumPlayers > 0
        ? normalizedDerivedNumPlayers
        : (parsedPlayersCount > 0 ? parsedPlayersCount : (normalizedDerivedNumPlayers ?? 0));
    const resolvedMaxPlayers = normalizedDerivedMaxPlayers ?? maxPlayersFallback ?? 0;
    const ping = await measureTcpPing(host, port);

    return res.json({
      success: true,
      data: {
        players,
        numplayers: shouldPreferVariableCounts(game)
          ? resolvedNumPlayers
          : (normalizedDerivedNumPlayers ?? parsedPlayersCount),
        maxplayers: resolvedMaxPlayers,
        ping,
        command: commandUsed,
      },
      output,
    });
  } catch (error) {
    return res.json({
      success: false,
      error: normalizeRconError(error),
      detail: String(error?.message || ''),
      code: 'RCON_REQUEST_FAILED',
    });
  }
});

export default router;