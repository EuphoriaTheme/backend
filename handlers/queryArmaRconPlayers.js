// ARMA RCON handler (using arma-rcon)
import ArmaRcon from 'arma-rcon';

/**
 * Query an ARMA server using RCON to fetch the player list.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - RCON port (default 2302)
 * @param {string} options.password - RCON password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Player list and raw response
 */
export default async function queryArmaRconPlayers({ host, port = 2302, password, timeout = 5000 }) {
  if (!host || !password) throw new Error('RCON query requires host and password');
  const rcon = new ArmaRcon({ host, port, password, timeout });
  try {
    await rcon.connect();
    // 'players' command returns player info
    const response = await rcon.command('players');
    await rcon.disconnect();
    // Parse player names from response (simple split, may need adjustment)
    const players = response.split('\n').filter(line => line.trim());
    return { success: true, players, raw: response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
