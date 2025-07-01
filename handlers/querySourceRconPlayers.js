// Generic Source/GoldSrc RCON handler (CS:GO, Garry's Mod, TF2, etc.)
import Rcon from 'rcon-srcds';

/**
 * Query a Source/GoldSrc server using RCON to fetch the player list.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - RCON port (default 27015)
 * @param {string} options.password - RCON password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Player list and raw response
 */
export default async function querySourceRconPlayers({ host, port = 27015, password, timeout = 5000 }) {
  if (!host || !password) throw new Error('RCON query requires host and password');
  const rcon = new Rcon({ host, port, password, timeout });
  try {
    await rcon.connect();
    // 'status' returns player info for Source/GoldSrc servers
    const response = await rcon.command('status');
    await rcon.disconnect();
    // Parse player list from response (simple regex, may need adjustment per game)
    const players = [];
    const lines = response.split('\n');
    let inPlayers = false;
    for (const line of lines) {
      if (line.match(/#\s+userid/)) { inPlayers = true; continue; }
      if (inPlayers && line.trim() === '') break;
      if (inPlayers) {
        // Example: # 2 "PlayerName" STEAM_1:0:123456 00:12  50    0 active
        const match = line.match(/#\s+\d+\s+"([^"]+)"/);
        if (match) players.push(match[1]);
      }
    }
    return { success: true, players, raw: response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
