var pg = require('pg'); // Postgres include
var config = require('./config/settings'); // Import custom settings

var masterPool;

masterPoolHelper = function () {
    if (!masterPool) {
        masterPool = new pg.Pool({ // Postgres Connection
            max: config.database.connectionLimit,
            host: config.database.host,
            user: config.database.user,
            password: config.database.password,
            database: config.database.master_db,
            port: config.database.port
        });
    }
    return masterPool;
};

module.exports = masterPoolHelper;