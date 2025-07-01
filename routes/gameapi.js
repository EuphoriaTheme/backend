import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import queryFiveMServer from '../handlers/queryFiveMServer.js';
import queryBeamMPServer from '../handlers/queryBeamMPServer.js';
import queryMinecraftServer from '../handlers/queryMinecraftServer.js';
import handleDefaultGame from '../handlers/defaultGameHandler.js';
import querySourceRconPlayers from '../handlers/querySourceRconPlayers.js';
import queryRustLikeRconPlayers from '../handlers/queryRustLikeRconPlayers.js';
import queryArmaRconPlayers from '../handlers/queryArmaRconPlayers.js';

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
  // Attach image path for each game if it exists in public/games
  const gamesWithImages = {};
  for (const [name, id] of Object.entries(games)) {
    // Build the expected image path (png, jpg, jpeg, webp)
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
    let imagePath = null;
    for (const ext of imageExtensions) {
      const possiblePath = path.join('public', 'games', `${id}.${ext}`);
      if (fs.existsSync(possiblePath)) {
        imagePath = `/public/games/${id}.${ext}`;
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
    // Source/GoldSrc RCON games
    //if (["csgo", "css", "cscz", "garrysmod", "tf2", "dod", "dods", "hl2d", "hlds", "l4d", "l4d2", "insurgency", "insurgencysandstorm"].includes(normalizedGame)) {
      // You may want to get password from query/body/env
    //  const { password } = req.query;
    //  if (!password) return res.status(400).json({ success: false, error: 'RCON password required' });
    //  const result = await querySourceRconPlayers({ host: ip, port, password });
    //  return res.json(result);
    //}
    // Rust/ARK/7DTD/Unturned RCON games
    if (["rust", "ark", "7dtd", "unturned"].includes(normalizedGame)) {
      const { password } = req.query;
      if (!password) return res.status(400).json({ success: false, error: 'RCON password required' });
      const result = await queryRustLikeRconPlayers({ host: ip, port, password });
      return res.json(result);
    }
    // ARMA RCON
    if (["arma2", "arma3", "armaresistance", "arma2oa", "arma"].includes(normalizedGame)) {
      const { password } = req.query;
      if (!password) return res.status(400).json({ success: false, error: 'RCON password required' });
      const result = await queryArmaRconPlayers({ host: ip, port, password });
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
