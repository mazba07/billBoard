var pg = require('pg'); // Postgres include
var config = require('./config/settings');

var pools = [];

// database: '_' + tenant,

poolHelper = function(tenant) {
    if (!pools[tenant]) {
        pools[tenant] = new pg.Pool({ // Postgres Connection
            max: config.database.connectionLimit,
            host: config.database.host,
            user: config.database.user,
            password: config.database.password,
            database: '_1',
            port: config.database.port
        });
    }
    return pools[tenant];
}

module.exports = poolHelper;