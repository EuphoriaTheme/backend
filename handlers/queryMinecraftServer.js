import { GameDig } from 'gamedig';

export default async function queryMinecraftServer(ip, port) {
  try {
    const data = await GameDig.query({ type: 'minecraft', host: ip, port: parseInt(port, 10), requestRules: true, requestPlayers: true });
    // Extract players, numplayers, and ping from the response
    const players = data.players || [];
    const numplayers = typeof data.numplayers === 'number' ? data.numplayers : (players ? players.length : 0);
    const ping = data.ping || null;
    return { success: true, data: { players, numplayers, ping } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
