import * as GameDig from 'gamedig';

export default async function queryOtherServers(game, ip, port) {
  try {
    const data = await GameDig.query({ type: game, host: ip, port: parseInt(port, 10) });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
