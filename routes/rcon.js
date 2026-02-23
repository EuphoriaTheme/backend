import express from 'express';
import { Rcon as MinecraftRcon } from 'rcon-client';
import RconSrcds from 'rcon-srcds';

const router = express.Router();

const toSafeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizePort = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return null;
  return parsed;
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
      const match = line.match(/^(\d{5,20})\s*,\s*(.+)$/);
      if (!match) return;

      players.push({
        name: match[2].trim(),
        uuid: match[1],
        ping: null,
      });
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

const callMinecraftRcon = async ({ host, port, password, command }) => {
  const client = await MinecraftRcon.connect({
    host,
    port,
    password,
    timeout: 8000,
  });

  try {
    const response = await client.send(command);
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
  const client = new RconSrcds({
    host,
    port,
    password,
    timeout: 8000,
  });

  await client.authenticate();
  try {
    const response = await client.execute(command);
    return response;
  } finally {
    try {
      await client.disconnect();
    } catch {
      // no-op
    }
  }
};

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
    return res.status(502).json({
      success: false,
      error: error?.message || 'RCON request failed.',
    });
  }
});

router.post('/players', async (req, res) => {
  const host = toSafeString(req.body?.host);
  const password = toSafeString(req.body?.password);
  const port = normalizePort(req.body?.port);
  const type = toSafeString(req.body?.type).toLowerCase() || 'source';
  const game = normalizeGameId(req.body?.game);
  const command = toSafeString(req.body?.command) || defaultPlayerCommandForGame(game);

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

    const players = parsePlayersByGame({ gameId: game, command, output });

    return res.json({
      success: true,
      data: {
        players,
        numplayers: players.length,
        maxplayers: 0,
        ping: null,
        command,
      },
      output,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: error?.message || 'RCON request failed.',
    });
  }
});

export default router;