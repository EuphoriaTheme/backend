const { QueryClient } = require('ts3-nodejs-library');

/**
 * Query a Teamspeak 3 server using ts3-nodejs-library.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.queryPort - Query port (default 10011)
 * @param {string} options.username - Query username
 * @param {string} options.password - Query password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryTeamspeak3Server(options) {
    const { host, queryPort = 10011, username, password, timeout = 5000 } = options;
    if (!host || !username || !password) throw new Error('Teamspeak 3 query requires host, username, and password');
    const ts3 = new QueryClient({
        host,
        queryPort,
        username,
        password,
        keepAlive: false,
        timeout,
    });
    try {
        await ts3.connect();
        const info = await ts3.send('serverinfo');
        await ts3.quit();
        return info;
    } catch (err) {
        throw new Error('Teamspeak 3 server query failed: ' + err.message);
    }
};
