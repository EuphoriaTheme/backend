const axios = require('axios');

/**
 * Query a Space Engineers server using the Torch REST API (if available).
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - Torch REST API port (default 8080)
 * @param {string} [options.token] - API token (optional)
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function querySpaceEngineersServer(options) {
    const { host, port = 8080, token, timeout = 5000 } = options;
    if (!host) throw new Error('Space Engineers query requires host');
    // Torch REST API must be enabled on the server
    try {
        const url = `http://${host}:${port}/v1/session`;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get(url, { headers, timeout });
        return res.data;
    } catch (err) {
        throw new Error('Space Engineers server query failed: ' + err.message);
    }
};
