// Rust/ARK/7 Days to Die/Unturned RCON handler (using rcon-client)
import { Rcon } from 'rcon-client';

/**
 * Query a Rust/ARK/7DTD/Unturned server using RCON to fetch the player list.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - RCON port (default 28016 for Rust)
 * @param {string} options.password - RCON password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Player list and raw response
 */
export default async function queryRustLikeRconPlayers({ host, port = 28016, password, timeout = 5000 }) {
  if (!host || !password) throw new Error('RCON query requires host and password');
  const rcon = new Rcon({ host, port, password, timeout });
  try {
    await rcon.connect();
    // Rust: 'playerlist', ARK: 'listplayers', 7DTD: 'listplayers', Unturned: 'players'
    // We'll try 'playerlist' by default, but you can adjust per game
    const response = await rcon.send('playerlist');
    await rcon.end();
    // Parse player names from response (simple split, may need adjustment per game)
    const players = response.split('\n').filter(line => line.trim() && !line.toLowerCase().includes('id'));
    return { success: true, players, raw: response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
