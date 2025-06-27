const Telnet = require('telnet-client');

/**
 * Query a Factorio server using RCON.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - RCON port (default 27015)
 * @param {string} options.password - RCON password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryFactorioServer(options) {
    const { host, port = 27015, password, timeout = 5000 } = options;
    if (!host || !password) throw new Error('Factorio query requires host and password');
    // Factorio supports RCON, but not all servers enable it
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
        // Send '/players' command to get player info
        const res = await connection.send('/players', {waitfor: '>'});
        await connection.end();
        // Parse response (example: 'Online players (2): Alice, Bob')
        const info = {};
        const regex = /Online players \((\d+)\):/i;
        const match = res.match(regex);
        if (match) {
            info.players = parseInt(match[1], 10);
        } else {
            info.raw = res;
        }
        return info;
    } catch (err) {
        throw new Error('Factorio server query failed: ' + err.message);
    }
};
