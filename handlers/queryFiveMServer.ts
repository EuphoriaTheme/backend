import axios from "axios";
import net from "net";
import pingServer from "./pingServer.js";
import {
  FIVEM_HTTP_TIMEOUT_MS,
  FIVEM_MAX_RESPONSE_BYTES,
} from "../config/gameQueryLimits.js";

function formatHostForHttpUrl(host) {
  return net.isIP(host) === 6 ? `[${host}]` : host;
}

export default async function queryFiveMServer(ip, port) {
  try {
    const parsedPort = parseInt(port, 10);
    const baseUrl = `http://${formatHostForHttpUrl(ip)}:${parsedPort}`;
    const requestConfig = {
      timeout: FIVEM_HTTP_TIMEOUT_MS,
      maxContentLength: FIVEM_MAX_RESPONSE_BYTES,
      maxBodyLength: FIVEM_MAX_RESPONSE_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
    };

    const [playerData, serverData, ping] = await Promise.all([
      axios.get(`${baseUrl}/players.json`, requestConfig),
      axios.get(`${baseUrl}/info.json`, requestConfig),
      pingServer(ip, parsedPort),
    ]);

    const players = (playerData.data || []).map((player) => ({
      name: player.name,
      uuid:
        player.identifiers?.find((id) => id.startsWith("fivem")) || "unknown",
      discord: player.identifiers?.find((id) => id.startsWith("discord")),
      steam: player.identifiers?.find((id) => id.startsWith("steam")),
      identifier: player.identifiers?.find((id) => id.startsWith("license")),
      ping: player.ping,
    }));
    return {
      success: true,
      data: {
        players,
        maxPlayers: parseInt(serverData?.data?.vars?.sv_maxClients || "0", 10),
        numPlayers: Array.isArray(playerData.data) ? playerData.data.length : 0,
        ping,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
