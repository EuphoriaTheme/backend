import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import queryFiveMServer from '../handlers/queryFiveMServer.js';
import queryBeamMPServer from '../handlers/queryBeamMPServer.js';
import queryMinecraftServer from '../handlers/queryMinecraftServer.js';
import handleDefaultGame from '../handlers/defaultGameHandler.js';

const router = express.Router();

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

// List all games from games.yml
router.get('/', (req, res) => {
  const games = getGamesList();
  const gamesWithImages = {};
  const baseUrl = `https://${req.get('host')}`;
  for (const [name, id] of Object.entries(games)) {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
    let imagePath = null;
    for (const ext of imageExtensions) {
      const possiblePath = path.join('public', 'games', `${id}.${ext}`);
      if (fs.existsSync(possiblePath)) {
        // Remove 'public' from the path and prepend the domain
        imagePath = `${baseUrl}/public/games/${id}.${ext}`;
        break;
      }
    }
    gamesWithImages[name] = { id, image: imagePath };
  }
  res.json(gamesWithImages);
});

// General Game server query (auth required)
router.get('/:game/ip=:ip&port=:port', async (req, res) => {
  const { game, ip, port } = req.params;
  const normalizedGame = game.toLowerCase();
  try {
    if (["fivem", "gta5f"].includes(normalizedGame)) {
      const result = await queryFiveMServer(ip, port);
      return res.json(result);
    }
    if (normalizedGame === "beammp") {
      const result = await queryBeamMPServer(ip, port);
      return res.json({ success: true, data: result });
    }
    if (normalizedGame === "minecraft") {
      const result = await queryMinecraftServer(ip, port);
      return res.json(result);
    }

    // Default handler for all other games
    const result = await handleDefaultGame(normalizedGame, ip, port);
    return res.json(result);
  } catch (error) {
    console.error(`Error processing request: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
