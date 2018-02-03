'use strict';

var pg = require('pg');
var config = require('../config/settings');

var pools = [];

// returns an existing pool. If no pool currently exists
// for the database, a new instance will be created and returned.
exports.read = function(key){
    if (!pools[key]){
        var cfg = {
            user: config.database.user,
            database: key,
            password: config.database.password,
            host: config.database.host,
            port: config.database.port,
            max: config.database.connectionLimit,
            idleTimeoutMillis: config.database.idleTimeout,
        }
        pools[key] = new pg.Pool(cfg);
    }

    return pools[key];
};
