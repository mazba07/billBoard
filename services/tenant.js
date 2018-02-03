var config = require('./config/settings'); // Import custom settings
var jwt = require('jsonwebtoken');
var provisionHelper = require('./provisionHelper');

var Tenant = {};
Tenant.encode = function(tid) {
    return provisionHelper.encodeTenant(tid);
}

Tenant.decode = function(tid) {
    if (!tid) {
        return config.tenant;
    }
    if (tid.indexOf('-') < 0) {
        return parseInt(tid, 24) / 1415;
    }
    return provisionHelper.decodeTenant(tid);
}

Tenant.fromBearer = function(bearer) {
    if (!bearer) {
        return config.tenant; // TODO: Change to a throw or some other error later
    }
    var token = bearer;
    if (token.startsWith('Bearer ')) {
        token = token.substring(7);
    }
    return jwt.decode(token).tenant;
}
Tenant.fromReq = function(req) {
    return Tenant.fromBearer(req.headers['authorization']);
}

module.exports = Tenant;