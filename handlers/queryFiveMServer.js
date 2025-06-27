import axios from 'axios';
import pingServer from './pingServer.js';

export default async function queryFiveMServer(ip, port) {
  try {
    const playerData = await axios.get(`http://${ip}:${port}/players.json`);
    const serverData = await axios.get(`http://${ip}:${port}/info.json`);
    const ping = await pingServer(ip, parseInt(port, 10));
    const players = (playerData.data || []).map((player) => ({
      name: player.name,
      uuid: player.identifiers?.find((id) => id.startsWith("fivem")) || 'unknown',
      discord: player.identifiers?.find((id) => id.startsWith("discord")),
      steam: player.identifiers?.find((id) => id.startsWith("steam")),
      identifier: player.identifiers?.find((id) => id.startsWith("license")),
      ping: player.ping,
    }));
    return {
      success: true,
      data: {
        players,
        maxPlayers: parseInt(serverData?.data?.vars?.sv_maxClients || '0', 10),
        numPlayers: Array.isArray(playerData.data) ? playerData.data.length : 0,
        ping,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
