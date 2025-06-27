const axios = require('axios');

/**
 * Query an Eco server using the Eco Web API (if available).
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - Web API port (default 3001)
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryEcoServer(options) {
    const { host, port = 3001, timeout = 5000 } = options;
    if (!host) throw new Error('Eco query requires host');
    // Eco exposes a web API at /info
    try {
        const url = `http://${host}:${port}/info`;
        const res = await axios.get(url, { timeout });
        return res.data;
    } catch (err) {
        throw new Error('Eco server query failed: ' + err.message);
    }
};
