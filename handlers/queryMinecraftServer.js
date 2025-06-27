import { GameDig } from 'gamedig';

export default async function queryMinecraftServer(ip, port) {
  try {
    const data = await GameDig.query({ type: 'minecraft', host: ip, port: parseInt(port, 10), requestRules: true, requestPlayers: true });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
