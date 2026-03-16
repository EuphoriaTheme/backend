import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import queryFiveMServer from '../handlers/queryFiveMServer.js';
import queryBeamMPServer from '../handlers/queryBeamMPServer.js';
import queryMinecraftServer from '../handlers/queryMinecraftServer.js';
import handleDefaultGame from '../handlers/defaultGameHandler.js';

function parseAndValidatePort(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
}

// Helper to get games list from YAML
function getGamesList() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const gamesPath = path.join(__dirname, '../public/games.yml');
  try {
    const file = fs.readFileSync(gamesPath, 'utf8');
    const games = yaml.load(file) || {};
    return games;
  } catch (e) {
    return {};
  }
}

export default async function registerGameApiRoutes(app) {
  const handleGameListRequest = async (request) => {
    const games = getGamesList();
    const gamesWithImages = {};
    const baseUrl = `https://${request.headers.host || ''}`;

    for (const [name, id] of Object.entries(games)) {
      const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
      let imagePath = null;
      for (const ext of imageExtensions) {
        const possiblePath = path.join('public', 'games', `${id}.${ext}`);
        if (fs.existsSync(possiblePath)) {
          imagePath = `${baseUrl}/public/games/${id}.${ext}`;
          break;
        }
      }
      gamesWithImages[name] = { id, image: imagePath };
    }

    return gamesWithImages;
  };

  app.get('/', handleGameListRequest);
  app.get('/index', handleGameListRequest);

  app.get('/:game/ip=:ip&port=:port', async (request, reply) => {
    const { game, ip, port } = request.params;
    const normalizedGame = String(game || '').toLowerCase();
    const normalizedIp = String(ip || '').trim();
    const normalizedPort = parseAndValidatePort(port);

    if (!normalizedIp) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid ip parameter. Expected a non-empty host/IP value.',
      });
    }

    if (normalizedPort === null) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid port parameter. Expected an integer between 1 and 65535.',
      });
    }

    try {
      if (['fivem', 'gta5f'].includes(normalizedGame)) {
        return await queryFiveMServer(normalizedIp, normalizedPort);
      }

      if (normalizedGame === 'beammp') {
        const result = await queryBeamMPServer(normalizedIp, normalizedPort);
        return { success: true, data: result };
      }

      if (normalizedGame === 'minecraft') {
        return await queryMinecraftServer(normalizedIp, normalizedPort);
      }

      return await handleDefaultGame(normalizedGame, normalizedIp, normalizedPort);
    } catch (error) {
      console.error(`Error processing request: ${error.message}`);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
