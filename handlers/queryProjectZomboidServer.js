const axios = require('axios');

/**
 * Query a Project Zomboid server using the public HTTP API (if available).
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - HTTP API port (default 16261)
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryProjectZomboidServer(options) {
    const { host, port = 16261, timeout = 5000 } = options;
    if (!host) throw new Error('Project Zomboid query requires host');
    // Project Zomboid does not have a public query protocol, but some servers run a status API
    try {
        const url = `http://${host}:${port}/status`;
        const res = await axios.get(url, { timeout });
        return res.data;
    } catch (err) {
        throw new Error('Project Zomboid server query failed: ' + err.message);
    }
};
