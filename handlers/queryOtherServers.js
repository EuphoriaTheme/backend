import * as GameDig from 'gamedig';

export default async function queryOtherServers(game, ip, port) {
  try {
    const data = await GameDig.query({ type: game, host: ip, port: parseInt(port, 10) });
    // Extract players, numplayers, maxplayers, and ping from the response
    const players = data.players || [];
    const numplayers = typeof data.numplayers === 'number' ? data.numplayers : (players ? players.length : 0);
    const maxplayers = typeof data.maxplayers === 'number' ? data.maxplayers : null;
    const ping = data.ping || null;
    return { success: true, data: { players, numplayers, maxplayers, ping } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
