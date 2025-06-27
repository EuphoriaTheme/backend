const Telnet = require('telnet-client');

/**
 * Query a 7 Days to Die server using Telnet.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - Telnet port (default 8081)
 * @param {string} options.password - Telnet password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function query7DaysToDieServer(options) {
    const { host, port = 8081, password, timeout = 5000 } = options;
    if (!host || !password) throw new Error('7 Days to Die query requires host and password');
    const connection = new Telnet();
    const params = {
        host,
        port,
        shellPrompt: '',
        timeout,
        password,
        negotiationMandatory: false,
        ors: '\n',
        irs: '\n',
        echoLines: 0,
    };
    try {
        await connection.connect(params);
        // Send 'listplayers' command to get player info
        const res = await connection.send('listplayers', {waitfor: '>'});
        await connection.end();
        // Parse response (example: 'Total of 3 in the game')
        const info = {};
        const regex = /Total of (\d+) in the game/i;
        const match = res.match(regex);
        if (match) {
            info.players = parseInt(match[1], 10);
        } else {
            info.raw = res;
        }
        return info;
    } catch (err) {
        throw new Error('7 Days to Die server query failed: ' + err.message);
    }
};
