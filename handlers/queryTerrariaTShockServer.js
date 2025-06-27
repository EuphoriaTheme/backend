const axios = require('axios');

/**
 * Query a Terraria (TShock) server using the TShock REST API.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - TShock REST API port (default 7878)
 * @param {string} [options.token] - TShock API token (optional for public endpoints)
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryTerrariaTShockServer(options) {
    const { host, port = 7878, token, timeout = 5000 } = options;
    if (!host) throw new Error('Terraria TShock query requires host');
    try {
        const url = `http://${host}:${port}/v2/server/status`;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(url, { headers, timeout });
        return res.data;
    } catch (err) {
        throw new Error('Terraria TShock server query failed: ' + err.message);
    }
};
