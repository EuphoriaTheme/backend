import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import queryFiveMServer from '../handlers/queryFiveMServer.js';
import queryBeamMPServer from '../handlers/queryBeamMPServer.js';
import queryMinecraftServer from '../handlers/queryMinecraftServer.js';
import handleDefaultGame from '../handlers/defaultGameHandler.js';

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
  app.get('/', async (request) => {
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
  });

  app.get('/:game/ip=:ip&port=:port', async (request, reply) => {
    const { game, ip, port } = request.params;
    const normalizedGame = String(game || '').toLowerCase();

    try {
      if (['fivem', 'gta5f'].includes(normalizedGame)) {
        return await queryFiveMServer(ip, port);
      }

      if (normalizedGame === 'beammp') {
        const result = await queryBeamMPServer(ip, port);
        return { success: true, data: result };
      }

      if (normalizedGame === 'minecraft') {
        return await queryMinecraftServer(ip, port);
      }

      return await handleDefaultGame(normalizedGame, ip, port);
    } catch (error) {
      console.error(`Error processing request: ${error.message}`);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
