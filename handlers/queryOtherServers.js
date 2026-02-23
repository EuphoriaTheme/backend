import { GameDig } from 'gamedig';

function normalizePlayers(players) {
  if (!Array.isArray(players)) {
    return [];
  }

  return players.map((player, index) => {
    if (player && typeof player === 'object') {
      const fallbackName =
        typeof player.name === 'string' && player.name.trim() !== ''
          ? player.name
          : `Player ${index + 1}`;

      return {
        ...player,
        name: fallbackName,
      };
    }

    if (typeof player === 'string') {
      return { name: player, raw: null };
    }

    return { name: `Player ${index + 1}`, raw: player ?? null };
  });
}

export default async function queryOtherServers(game, ip, port) {
  try {
    const data = await GameDig.query({ type: game, host: ip, port: parseInt(port, 10) });
    // Extract players, numplayers, maxplayers, and ping from the response
    const players = normalizePlayers(data.players);
    const numplayers = typeof data.numplayers === 'number' ? data.numplayers : (players ? players.length : 0);
    const maxplayers = typeof data.maxplayers === 'number' ? data.maxplayers : null;
    const ping = data.ping || null;
    return { success: true, data: { players, numplayers, maxplayers, ping } };
  } catch (error) {
    if (game === 'hytale') {
      return {
        success: false,
        error:
          'Hytale query failed. GameDig requires a Hytale query plugin/mod on the server (for example hytale-plugin-query) with query permissions enabled.',
      };
    }

    return { success: false, error: error.message };
  }
}
