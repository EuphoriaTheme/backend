const Telnet = require('telnet-client');

/**
 * Query an Empyrion server using Telnet.
 * @param {Object} options
 * @param {string} options.host - Server IP or hostname
 * @param {number} options.port - Telnet port (default 30004)
 * @param {string} options.password - Telnet password
 * @param {number} [options.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Server info and stats
 */
module.exports = async function queryEmpyrionServer(options) {
    const { host, port = 30004, password, timeout = 5000 } = options;
    if (!host || !password) throw new Error('Empyrion query requires host and password');

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
        // Login: Empyrion expects 'telnet password' prompt, but telnet-client handles this with password param
        // Send 'stats' command to get server info
        const res = await connection.send('stats', {waitfor: '>'});
        await connection.end();
        // Parse response (example: 'Server: MyServerName | Players: 3/10 | ...')
        const info = {};
        const regex = /Server:\s*(.*?)\s*\|\s*Players:\s*(\d+)\/(\d+)/i;
        const match = res.match(regex);
        if (match) {
            info.serverName = match[1];
            info.players = parseInt(match[2], 10);
            info.maxPlayers = parseInt(match[3], 10);
        } else {
            info.raw = res;
        }
        return info;
    } catch (err) {
        throw new Error('Empyrion server query failed: ' + err.message);
    }
};
