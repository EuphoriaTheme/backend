const axios = require('axios');

/**
 * Query a Satisfactory server using the community status API (if available).
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - Server port (default 15777)
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function querySatisfactoryServer(options) {
    const { host, port = 15777, timeout = 5000 } = options;
    if (!host) throw new Error('Satisfactory query requires host');
    // Satisfactory does not have a public query protocol, but some servers run a status API
    try {
        const url = `http://${host}:${port}/status`;
        const res = await axios.get(url, { timeout });
        return res.data;
    } catch (err) {
        throw new Error('Satisfactory server query failed: ' + err.message);
    }
};
