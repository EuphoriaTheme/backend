const axios = require('axios');

/**
 * Query an Unturned server using RocketMod HTTP API (if available).
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - HTTP API port (default 25444)
 * @param {string} [options.token] - API token (optional)
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryUnturnedServer(options) {
    const { host, port = 25444, token, timeout = 5000 } = options;
    if (!host) throw new Error('Unturned query requires host');
    // RocketMod HTTP API must be enabled on the server
    try {
        const url = `http://${host}:${port}/v1/server/info`;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(url, { headers, timeout });
        return res.data;
    } catch (err) {
        throw new Error('Unturned server query failed: ' + err.message);
    }
};
