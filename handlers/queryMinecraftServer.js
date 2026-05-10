import { GameDig } from 'gamedig';
import {
  GAMEQUERY_ATTEMPT_TIMEOUT_MS,
  GAMEQUERY_MAX_RETRIES,
  GAMEQUERY_SOCKET_TIMEOUT_MS,
} from '../config/gameQueryLimits.js';

export default async function queryMinecraftServer(ip, port) {
  try {
    const data = await GameDig.query({
      type: 'minecraft',
      host: ip,
      port: parseInt(port, 10),
      requestRules: true,
      requestPlayers: true,
      maxRetries: GAMEQUERY_MAX_RETRIES,
      socketTimeout: GAMEQUERY_SOCKET_TIMEOUT_MS,
      attemptTimeout: GAMEQUERY_ATTEMPT_TIMEOUT_MS,
    });
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
