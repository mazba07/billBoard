var log4js = require('log4js'); // Require log4js
var express = require('express'); // Express instaniated a different way for serving static webpages
var process = require('process');

log4js.configure('./config/log4js.json');

// Set the logging variable to the server category(optional)
var logger = log4js.getLogger('server');

var app = express(); // Express App include
var path = require('path');
var config = require('./config/settings'); // Import custom settings

// Validate settings
if (!config.storageLocation) {
    config.storageLocation = __dirname;
}

if (!config.routePrefix) {
    config.routePrefix = '/ws';
}

var getTenantDB = require('./db'); // Create a DB pool connection
var getMasterDB = require('./dbMaster');
var fs = require('fs'); // Allow the use of Node filesystem APIs
var busboy = require('connect-busboy'); // Allows BusBoy to handle uploading files
var bodyParser = require('body-parser');
var PlayerBuilder = require('./PlayerBuilder').PlayerBuilder;
var InViewBuilder = require('./InViewBuilder').InViewBuilder;
var subscriptions = require('./routes/subscriptions');
var crypto = require('crypto');
var expressJWT = require('express-jwt');
var jwt = require('jsonwebtoken');
var Tenant = require('./tenant');
var vm = require('vm');
var updateDynamicPlayerGroups = require('./createDynamicGroup');
var updateDynamicInviewAudiences = require('./createDynamicAudience');
var UrlSafeBase64 = require('./UrlSafeBase64');
var moment = require('moment'); // Time Library
var memwatch = require('memwatch-next');
var provisionHelper = require('./provisionHelper');
var url = require('url');


// connect logger
app.use(log4js.connectLogger(log4js.getLogger('http'), { level: 'auto' }));

logger.info("A new instance of Web Services started on " + Date() + ".");

//=========== uncaught exception handler ========================
process.on('uncaughtException', function(err) {
    logger.error("uncaughtException:"+ err);
    process.exit(1);
});

//=========== memwatch-next memory leak detection logic ========================
// Get baseline memory after 15 seconds
/*
var baseMemory = null;
setTimeout(function() {
    logger.debug("Taking heap snapshot with mem watch");
    baseMemory = new memwatch.HeapDiff();
}, 15 * 1000);

memwatch.on('stats', function(stats) {
    logger.debug('Mem Watch Stats: ' + JSON.stringify(stats));
});

memwatch.on('leak', function(info) {
    logger.error('Mem Watch Leak Detected: ' + JSON.stringify(info));
    if ((baseMemory) && (baseMemory !== null)) {
        var diff = baseMemory.end();
        logger.error("Mem Watch Heap Differences: " + JSON.stringify(diff));
    }
});
*/
//=============================================================================

// Set port
app.listen(config.web.port);

// Allow the PlayerBuilder to grab content from Maestro
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization, x-csrf-token");
    next();
});

/*
function _ws( r) {
    return config.routePrefix + r;
}
*/

/*
if (config.useAuthentication) {
    app.use(expressJWT({ secret: config.secret })
        .unless({
            path: [
                '/login'),
                '/passwordreset'),
                '/checkin'),
                '/check'),
                '/validate'),
                '/generateToken')
            ]
        }));

    app.use(function(err, req, res, next) {
        if (err.name === 'UnauthorizedError') {
            res.status(401).send('Authentication Failed');
        }
    });
}
*/

app.use(busboy());
app.use(bodyParser.json());


// Create the URL to add a link to the location of where the screenshot will be stored.
var hostingURL = config.web.uri + ":" + config.web.port;

// Setup a static website to serve screenshots
app.use('/screenshots', express.static(config.storageLocation + '/screenshots'));

// Setup a static website to serve deb package for upgrades
app.use('/upgradePlayer', express.static(config.storageLocation + '/upgradePlayer'));

// the getData subscriptions
app.use('/subscriptions', subscriptions);

function createTenantFolders(tenant) {
    try {
        var logsDir = config.storageLocation + '/logs/' + tenant;
        var screenshotDir = config.storageLocation + '/screenshots/' + tenant;
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir);
            logger.info("The log directory was missing but has been created.")
        }
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir);
            logger.info("The screenshot directory was missing but has been created.")
        }
    } catch (err) {
        logger.error("Unable to create tenant folders: " + err);
    }
}

// Helper for provisioned players
function getProvisionedTenantInfo(token, callback) {
    getMasterDB().connect(function(err, connection, done) {
        if (err) {
            done();
            callback(err);
            return;
        }

        var query;
        query = 'SELECT tenant_id FROM provisioning WHERE UPPER(token) = UPPER($1);';

        connection.query(query, [token], function(err, result) {
            if (err) {
                logger.error("Token " + token + " unable to query devops for provisioning information " + err);
                done();
                return callback(err, null);
            }

            if (result.rows.length < 1) {
                done();
                return callback(null, result.rows); // not provisioned
            }

            var tenant = result.rows[0].tenant_id;

            query = 'select * from instances where (user_id is null) or (user_id = $1) order by user_id asc';

            connection.query(query, [tenant], function(err, result) {
                if (err) {
                    logger.error("Tenant " + tenant + " unable to query devops for instance information " + err);
                    done();
                    return callback(err, null);
                }
                done();
                if (result.rows.length > 0) {
                    result.rows[0].tenant = tenant;
                }
                callback(null, result.rows);
            });
        });
    });
}

// Helper for INVIEW players
function getTenantInfo(tenant, callback) {
    getMasterDB().connect(function(err, connection, done) {
        if (err) {
            done();
            callback(err);
            return;
        }

        var query;
        query = 'select * from instances where (user_id is null) or (user_id = $1) order by user_id asc';

        connection.query(query, [tenant], function(err, result) {
            if (err) {
                logger.error("Tenant " + tenant + " unable to query devops for instance information " + err);
                done();
                return;
            }
            done();
            callback(null, result.rows);
        });
    });
}

// -------------------------- Begin Token Generator --------------------------------
app.get('/generateToken', function(req, res, next) {
    logger.info("A new generate token request has started at " + Date() + ".");

    if (req.query.tenant) {
        var tenant = parseInt(req.query.tenant);
        var token = provisionHelper.encodeTenant(tenant);
        res.send(token);
        return;
    } else {
        res.status(400).send({ status: 400, error: "Invalid request URI" });
    }
});

// -------------------------- Begin Check Token Provisioning --------------------------------
app.get('/check', function(req, res, next) {
    logger.info("A new provision token check request has started at " + Date() + ".");

    var provision = { provisioned: false }; // default

    if (req.query.tt) {
        if (provisionHelper.validateTenant(req.query.tt)) {
            var tenant = provisionHelper.decodeTenant(req.query.tt);
            getTenantInfo(tenant, function(err, rows) {
                if (err) {
                    logger.error("Tenant " + tenant + " can't get tenant info from devops: " + err);
                    res.status(500).send({ status: 500, error: "unable to get tenant info from devops" });
                    return;
                }
                provision.provisioned = true;
                for (var i = 0; i < rows.length; i++) {
                    if ((rows[i].type_id == 3) && (!provision.cms)) {
                        provision.cms = rows[i].url;
                    }
                    if ((rows[i].type_id == 6) && (!provision.webService)) {
                        provision.webService = rows[i].url;
                        var ws = url.parse(provision.webService);
                        if ((!ws.path) || (ws.path == '/')) {
                            provision.webService += config.routePrefix;
                        }
                    }
                }
                provision.tenant_token = req.query.tt;
                res.send(provision);
                return;
            });
        } else {
            provision.error = 'Invalid token';
            res.send(provision);
            return;
        }
    } else if (req.query.pt) {
        if (provisionHelper.validate(req.query.pt)) {
            getProvisionedTenantInfo(req.query.pt, function(err, rows) {
                if (err) {
                    logger.error("Token " + req.query.pt + " unable to get provisioning information: " + err);
                    res.status(500).send({ status: 500, error: "unable to get provisioning information from devops" });
                    return;
                }
                if (rows.length < 1) {
                    res.send(provision);
                    return;
                }

                var tenant = rows[0].tenant;
                var tenant_token = provisionHelper.encodeTenant(tenant);

                for (var i = 0; i < rows.length; i++) {
                    if ((rows[i].type_id == 3) && (!provision.cms)) {
                        provision.cms = rows[i].url;
                    }
                    if ((rows[i].type_id == 6) && (!provision.webService)) {
                        provision.webService = rows[i].url;
                        var ws = url.parse(provision.webService);
                        if ((!ws.path) || (ws.path == '/')) {
                            provision.webService += config.routePrefix;
                        }
                    }
                }

                if ((!provision.cms) || (!provision.webService)) {
                    provision.error = "Unable to get information from devops table"
                    res.send(provision);
                    return;
                }

                provision.provisioned = true;
                provision.tenant_token = tenant_token;
                res.send(provision);
                return;
            });
        } else {
            provision.error = 'Invalid token';
            res.send(provision);
            return;
        }
    } else {
        res.status(400).send({ status: 400, error: "Invalid request URI" });
    }
});

// ---------------------------- Begin Token Validation -------------------------------------
app.get('/validate', function(req, res, next) {
    logger.info("A new provision token validate request has started at " + Date() + ".");

    var validation = 'false';
    if (req.query.token) {
        validation = provisionHelper.validate(req.query.token).toString();
    }

    res.send(validation);
});

// ------------------------------------- Begin Checkin -------------------------------------
app.get('/checkin', function(req, res, next) {
    logger.info("A new check-in request has started at " + Date() + ".");

    var p = {};
    try {
        // Parse incoming into JSON
        var parsed = JSON.parse(req.query.pl);

        // Set parsed JSON string into variables
        p.agent_version = req.agent_version;
        p.ip_address = req.ip;
        p.server = parsed.server;
        p.player_id = parsed.playerID;
        p.tenant = Tenant.decode(parsed.tenant_token);
        logger.info("Tenant " + p.tenant + ` Checkin:  tenant_token(${parsed.tenant_token}) => tenant(${p.tenant}`);

        createTenantFolders(p.tenant);

        p.osArch = parsed.osArch;
        p.platform = parsed.platform;
        p.release = parsed.release;
        p.totalmem = parsed.totalmem;
        p.player_name = parsed.player_name;

        if (parsed.playerTime) {
            p.playerTime = parsed.playerTime;
        }

        p.volume = parsed.volume;

        if (parsed.sleepTime) {
            p.sleepTime = parsed.sleepTime;
        } else {
            p.sleepTime = '';
        }

        if (parsed.wakeupTime) {
            p.wakeupTime = parsed.wakeupTime;
        } else {
            p.wakeupTime = '';
        }

        p.disableMouse = parsed.disableMouse;
        p.osVersion = parsed.osVersion;
        p.graphicsCard = parsed.graphicsCard;
        p.cpuUsage = parsed.cpuUsage;
        p.diskSpace = parsed.diskSpace;
        p.logLevel = parsed.logLevel;
        if (parsed.accessPoint) {
            p.accessPointSsid = parsed.accessPoint.ssid;
            p.accessPointMode = parsed.accessPoint.mode;
            p.accessPointUsername = parsed.accessPoint.username;
            p.accessPointPassword = parsed.accessPoint.password;
            p.accessPointSecurity = JSON.stringify(parsed.accessPoint.security);
        } else {
            p.accessPointSsid = '';
            p.accessPointMode = '';
            p.accessPointUsername = '';
            p.accessPointPassword = '';
            p.accessPointSecurity = '[]';
        }

        p.screenshot = !!parseInt(parsed.screenshot);
        p.heartbeatInterval = +parseInt(parsed.heartbeatInterval);
        p.checkinInterval = +parseInt(parsed.checkinInterval);
        p.screenshotInterval = +parseInt(parsed.screenshotInterval);

        // Retrieve and parse indivdual MacAddress information
        p.macAddressInterface = [];
        p.macAddressIP = [];
        if (parsed.macAddress) {
            for (var i = 0; i < parsed.macAddress.length; i++) { p.macAddressInterface.push(parsed.macAddress[i].interface); }
            for (var i = 0; i < parsed.macAddress.length; i++) { p.macAddressIP.push(parsed.macAddress[i].address); }
        }

        // Retrieve and parse indivdual display information

        p.displaysOrientation = [];
        if (parsed.displays) {
            for (var i = 0; i < parsed.displays.length; i++) { p.displaysOrientation.push(parsed.displays[i].orientation); }
        }

        p.displaysResolution = [];
        p.displaysPort = [];
        p.modelName = [];
        if (parsed.displayInfos) {
            for (var i = 0; i < parsed.displayInfos.length; i++) { p.displaysPort.push(parsed.displayInfos[i].port); }
            for (var i = 0; i < parsed.displayInfos.length; i++) { p.displaysResolution.push(parsed.displayInfos[i].resolution); }
            for (var i = 0; i < parsed.displayInfos.length; i++) { p.modelName.push(parsed.displayInfos[i].model_name); }
        }

        p.cpus = [];
        if (parsed.cpus) {
            for (var i = 0; i < parsed.cpus.length; i++) { p.cpus.push(parsed.cpus[i].model); }
        }


    } catch (err) {
        logger.error("Tenant " + p.tenant + " Invalid JSON format: " + err);
        res.status(400).send({ status: 400, error: "Invalid JSON format" });
        return;
    }

    getTenantDB(p.tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + p.tenant + " connection failed at checkin: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at checkin" });
            done();
            return;
        }

        // Start of player pre-existance checking
        // Seed the values with something that will never match.
        var nicInterface = "nomatch";
        var nicMac = "nomatch";
        if (p.player_id == 0) {
            // Look for the ethernet adapter interface (always starts with 'e')
            for (var i = 0; i < p.macAddressInterface.length; i++) {
                if (p.macAddressInterface[i].toLowerCase().startsWith('e')) {
                    nicInterface = p.macAddressInterface[i];
                    nicMac = p.macAddressIP[i];
                }
            }
        }

        connection.query('SELECT * FROM player_nic_r WHERE interface_name = $1 and mac = $2;', [nicInterface, nicMac],
            function(err, result) { // Pre-existence query
                if (err) {
                    logger.error("Tenant " + p.tenant + " Failure in player pre-existence checking: " + err);
                    done();
                    return;
                }

                if (result.rows.length > 0) {
                    p.player_id = result.rows[0].player_id;
                }

                // If this the player ID is zero, this is the first time a player is being setup and it needs a UniqueID
                if (p.player_id == 0) {

                    logger.info("Tenant " + p.tenant + " -----------------Begin new player Check-in-----------------");
                    logger.info("Tenant " + p.tenant + " The server has identifed the player as a new player with a player ID of 0.");


                    // Insert the values into the [player_r] table and return the new playerID
                    try {
                        p.updated_dt = new Date();
                        p.created_dt = p.updated_dt;
                        connection.query('INSERT INTO public.player_r (player_name, playertime, osArch, ip_address, osversion, graphicscard, server, volume, sleeptime, wakeuptime, screenshot, \
                disablemouse, loglevel, heartbeatinterval, checkininterval, screenshotinterval, ap_ssid, ap_uid, ap_pd, ap_mode, ap_sec, agent_version, platform, release, totalmem, cpus, player_model, created_dt, updated_dt) \
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29) RETURNING player_id', [p.player_name, p.playerTime,
                                p.osArch, p.ip_address, p.osVersion, p.graphicsCard, p.server, p.volume, p.sleepTime, p.wakeupTime, p.screenshot, p.disableMouse, p.logLevel, p.heartbeatInterval,
                                p.checkinInterval, p.screenshotInterval, p.accessPointSsid, p.accessPointUsername, p.accessPointPassword, p.accessPointMode, p.accessPointSecurity,
                                p.agent_version, p.platform, p.release, p.totalmem, p.cpus, p.modelName, p.created_dt, p.updated_dt
                            ],
                            function(err, result) {
                                if (err) {
                                    logger.error("Tenant " + p.tenant + " Database insertion into [player_r] for the new player has failed. " + err);
                                    done();
                                    return;
                                }

                                // Store the Unique Player ID
                                var newPlayerID = parseInt(result.rows[0].player_id);
                                logger.info("Tenant " + p.tenant + " A new player ID has been created: " + newPlayerID);
                                logger.info("Tenant " + p.tenant + " -----------------Ended new player Check-in-----------------");

                                // Grab the new playerID and store it into [player_resources_r] with the remaining values
                                connection.query("INSERT INTO player_resources_r VALUES ($1,$2,$3,null,timezone('UTC',CURRENT_TIMESTAMP),timezone('UTC',CURRENT_TIMESTAMP))", [newPlayerID, p.cpuUsage, p.diskSpace],
                                    function(err, result) {
                                        if (err) {
                                            logger.error("Tenant " + p.tenant + " Insert into player_resources_r failed: " + err);
                                            done();
                                            return;
                                        }

                                        // For each Mac Interface, insert into DB
                                        for (var i = 0; i < p.macAddressInterface.length; i++) {
                                            // Grab the new playerID and store the Nic information
                                            connection.query('INSERT INTO player_nic_r (player_id, interface_name, mac) VALUES ($1,$2,$3)', [newPlayerID, p.macAddressInterface[i], p.macAddressIP[i]],
                                                function(err, result) {
                                                    if (err) {
                                                        logger.error("Tenant " + p.tenant + " Insert into player_nic_r failed: " + err);
                                                        done();
                                                        return;
                                                    }
                                                });
                                        };

                                        // For each display, insert into DB
                                        for (var i = 0; i < p.displaysPort.length; i++) {
                                            // Grab the new playerID and store the display information: player_id, interface_name, mac
                                            connection.query('INSERT INTO player_display_r (player_id, display_port, resolution, orientation) VALUES ($1,$2,$3,$4)', [newPlayerID, p.displaysPort[i],
                                                p.displaysOrientation[i], p.displaysResolution[i]
                                            ], function(err, result) {
                                                if (err) {
                                                    logger.error("Tenant " + p.tenant + " Insert into player_nic_r failed: " + err);
                                                    done();
                                                    return;
                                                }
                                            });
                                        };
                                    });

                                var bearer = jwt.sign({ playerid: newPlayerID, tenant: p.tenant }, config.secret, { expiresIn: '365d' });
                                res.send({ "playerID": newPlayerID, "bearer": bearer });
                                done();
                                return;
                            });

                    } catch (err) {
                        logger.error("Tenant " + p.tenant + " Database query for a new player failed: " + err);
                        res.status(500).send({ status: 500, error: "Database query for a new player failed" });
                        done();
                        return;
                    }

                    logger.info("Tenant " + p.tenant + " The data for the new player has been successfully added to the database!");

                } // End If
                else { // This player already has a UniqueID and only updates the tables

                    logger.info("Tenant " + p.tenant + " -----------------Begin existing player Check-in " + p.player_id + "-----------------");
                    logger.info("Tenant " + p.tenant + " The server has detected an existing user. Commencing with the check-in.");

                    try {
                        p.updated_dt = new Date();
                        // Update the values in the [player_r] database
                        connection.query('UPDATE player_r SET player_name=$1, playertime=$2, ip_address=$3, osversion=$4, graphicscard=$5, server=$6, volume=$7, sleeptime=$8, wakeuptime=$9, screenshot=$10, \
                disablemouse=$11, loglevel=$12, heartbeatinterval=$13, checkininterval=$14, screenshotinterval=$15, ap_ssid=$16, ap_uid=$17, ap_pd=$18, ap_mode=$19, ap_sec=$20, agent_version=$21, osArch=$22,\
                platform = $23, release=$24, totalmem=$25, cpus= $26, updated_dt=$27 WHERE player_id=$28', [p.player_name, p.playerTime, p.ip_address, p.osVersion, p.graphicsCard, p.server, p.volume, p.sleepTime, p.wakeupTime, p.screenshot, p.disableMouse, p.logLevel, p.heartbeatInterval, p.checkinInterval,
                                p.screenshotInterval, p.accessPointSsid, p.accessPointUsername, p.accessPointPassword, p.accessPointMode, p.accessPointSecurity, p.agent_version, p.osArch, p.platform, p.release,
                                p.totalmem, p.cpus, p.updated_dt, p.player_id
                            ],
                            function(err, result) {
                                if (err) {
                                    logger.error("Tenant " + p.tenant + " Database update for " + p.player_id + " into [player_r] has failed: " + err);
                                    done();
                                    return;
                                }

                                // Update the values in the [player_resources_r] database
                                connection.query("UPDATE player_resources_r SET cpuUsage=$1, diskSpace=$2, updated_dt=timezone('UTC',CURRENT_TIMESTAMP) WHERE player_id=$3", [p.cpuUsage, p.diskSpace, p.player_id],
                                    function(err, result) {
                                        if (err) {
                                            logger.error("Tenant " + p.tenant + " Database update for " + p.player_id + " into [player_resources_r] has failed: " + err);
                                            res.status(500).send({ status: 500, error: "Database update of player resources has failed" });
                                            done();
                                            return;
                                        }
                                    });

                            }); // End Update Query
                    } catch (err) {
                        logger.error("Tenant " + p.tenant + " Database query for an existing player failed: " + err);
                        res.status(500).send({ status: 500, error: "Database query for an existing player failed" });
                        done();
                        return;
                    }

                    try {
                        // Use the PlayerBuilder class to query the DB and retrieve playlist information
                        var pb = new PlayerBuilder();
                        pb.build(p.tenant, p.player_id, connection, function(err, instructions) {
                            if (err) {
                                logger.error("Tenant " + p.tenant + ` Unable to build player ${p.player_id} instructions: ` + err);
                                res.status(500).send({ status: 500, error: "Unable to build player instructions" });
                                done();
                                return;
                            } else {
                                var bearer = jwt.sign({ playerid: p.player_id, tenant: p.tenant }, config.secret, { expiresIn: '365d' });
                                res.send({ "playerID": p.player_id, "bearer": bearer, "instructions": instructions });
                                beginRules();

                                // Begin Rules
                                function beginRules() {
                                    // Setup rollback in case the transaction fails
                                    var rollback = function(connection, done) {
                                            connection.query('ROLLBACK', function(err) {
                                                // TODO: Log Error
                                                return done(err);
                                            });
                                        }
                                        // Begin a transaction for rules
                                        // TODO: callback for commit
                                    connection.query('BEGIN TRANSACTION', function(err, result) {
                                        if (err) return rollback(connection, done);
                                        updateDynamicPlayerGroups(p.player_id, connection);
                                        // Commit everything and run the code
                                        connection.query('COMMIT', done);
                                    });

                                }
                                return;
                            }
                        });
                    } catch (err) {
                        logger.error("Tenant " + p.tenant + " Database query to find playlist information failed: " + err);
                        res.status(500).send({ status: 500, error: "DatabDatabase query to find playlist information failed" });
                        done();
                        return;
                    }
                    logger.info("Tenant " + p.tenant + " The Check-in has completed successfully.");
                    logger.info("Tenant " + p.tenant + " -----------------Ended existing player Check-in-----------------");
                } // End else for player update
            }); // check for player pre-existance
    }); // Close the connection pool
}); // End Checkin service

// ------------------------------------- Begin instructions -------------------------------------
app.get('/instructions', function(req, res) {
    logger.info("A new instructions request has started at " + Date() + ".");

    // Create a connection pool for Postgres queries
    var tenant = Tenant.fromReq(req);

    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at instructions: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at instructions" });
            done();
            return;
        }

        // Set URL string to variable incoming

        var id;
        if (req.query.pid) {
            id = parseInt(req.query.pid);
            var pb = new PlayerBuilder();
            pb.build(tenant, id, connection, function(err, result) {
                if (err) {
                    logger.error("Tenant " + tenant + " ", err);
                }
                res.send(result);
                done();
                return;
            });
        } else if (req.query.iid) {
            id = parseInt(req.query.iid);
            var iv = new InViewBuilder();
            iv.build(tenant, id, connection, function(err, result) {
                if (err) {
                    logger.error("Tenant " + tenant + " ", err);
                }
                done();
                res.send(result);
                return;
            });
        } else {
            done();
            res.status(400).send({ status: 400, error: "Invalid request URI" });
        }
    }); // Close the connection pool
}); // End Instructions service

// ------------------------------------- Begin alerts -------------------------------------
app.get('/alerts', function(req, res) {
    logger.info("A new alerts request has started at " + Date() + ".");

    // Create a connection pool for Postgres queries
    var tenant = Tenant.fromReq(req);

    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at alerts: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at alerts" });
            done();
            return;
        }

        // Set URL string to variable incoming

        var iid;
        var last;
        if (req.query.iid && req.query.last) {
            iid = parseInt(req.query.iid);
            last = parseInt(req.query.last);
            var query;
            if (last <= 0) {
                if (last == 0) {
                    last = 10;
                } else {
                    last = -last; // make positive
                }
                query = 'SELECT inview_user_alert_id AS id, message, created_at AS sent FROM inview_user_alert_r WHERE (inview_user_id = $1) ORDER BY inview_user_alert_id DESC LIMIT $2;';
            } else {
                query = 'SELECT inview_user_alert_id AS id, message, created_at AS sent FROM inview_user_alert_r WHERE (inview_user_id = $1) and (inview_user_alert_id > $2);';
            }
            connection.query(query, [iid, last],
                function(err, results) {
                    if (err) {
                        logger.error("Tenant " + tenant + ' alert query failed: ' + err);
                        done();
                        res.status(500).send({ status: 500, error: "alert query failed" });
                        done();
                        return;
                    }

                    var messages = [];
                    for (var i = 0; i < results.rows.length; i++) {
                        messages.push({ id: results.rows[i].id, message: results.rows[i].message, sent: results.rows[i].sent });
                    }
                    res.send(messages);
                    done();
                    return;
                });
        } else {
            res.status(400).send({ status: 400, error: "Invalid request URI" });
            done();
            return;
        }
    });
}); // End alerts service


// ------------------------------------- Begin Screenshot -------------------------------------
// Screenshot Service
app.post('/uploadscreenshot', function(req, res) {

    var tenant = Tenant.fromReq(req);

    // Create a connection pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at screenshot: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at screenshot" });
            done();
            return;
        }

        if (req.busboy) {
            var fstream;
            req.busboy.on('file', function(fieldname, file, filename) {
                var location = config.storageLocation + '/screenshots/' + tenant;

                logger.info("Tenant " + tenant + " Uploading: " + filename + " to " + location);

                fstream = fs.createWriteStream(location + '/' + filename);
                file.pipe(fstream);
                fstream.on('close', function() {

                    var newScreenshotLink = String(hostingURL + '/screenshots/' + tenant + '/' + filename);
                    var playerID = parseInt(filename.slice(0, -4));

                    // Update the screenshot link in the [player_resources_r] database
                    connection.query('UPDATE player_resources_r SET screenshotLink=$1 WHERE player_id=$2', [newScreenshotLink, playerID],
                        function(err, result) {
                            done();
                            if (err) {
                                logger.error("Tenant " + tenant + " Database update for the screenshot URL in [player_resources_r] for " + playerID + " has failed: " + err);
                                return;
                            }
                            logger.info("Tenant " + tenant + " Screenshot successfully uploaded.");
                        });
                    res.send('Success');
                }); // Close fstream
            }); // End BusBoy Upload
            req.pipe(req.busboy);
        } else {
            res.status(400).send({ status: 400, error: "Screenshot payload not provided" });
        }
    }); // Close the connection pool
});

// ------------------------------------- Begin Heartbeat -------------------------------------
app.get('/heartbeat', function(req, res) {

    // Set URL string to variable incoming
    var incoming = req.query.pl;

    var tenant = Tenant.fromReq(req);

    try {
        // Parse incoming into JSON
        var parsed = JSON.parse(incoming);

        // Set parsed JSON string into variables
        var playerID = parsed.playerID;

    } catch (err) {
        logger.error("JSON parse for the HeartBeat service has failed: " + err);
        res.status(400).send({ status: 400, error: "JSON passed to hearbeat could not be parsed." });
        return;
    }

    // Create a connection pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at heartbeat: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at heartbeat" });
            done();
            return;
        }
        // Check the database for new action verbs
        connection.query('SELECT action FROM heartbeat_work_queue_r WHERE player_id=$1', [playerID],
            function(err, result) {
                if (err) {
                    logger.error("Tenant " + tenant + " Database retreival from [heartbeat_work_queue_r] for " + playerID + " has failed: " + err);
                    done();
                    return;
                }

                // Grab the task info and insert into an array
                var collectActions = [];
                try {
                    for (var i = 0; i < result.rows.length; i++) {
                        var item = result.rows[i].action;

                        // If item is JSON
                        if (item.startsWith("{")) {
                            try {
                                var parseActions = JSON.parse(item);
                                collectActions.push(parseActions);
                            } catch (e) {
                                collectActions.push(item);
                            }
                        } else {
                            collectActions.push(item);
                        }

                    }

                } catch (err) {
                    logger.error("Tenant " + tenant + " Search for Heartbeat actions failed: " + err);
                    res.status(500).send({ status: 500, error: "Search for Heartbeat actions failed" });
                    done();
                    return;
                }

                // Remove the action from the database
                connection.query('DELETE FROM heartbeat_work_queue_r WHERE player_id=$1', [playerID], function(err, result) {
                    if (err) {
                        logger.error("Tenant " + tenant + " Database removal from [heartbeat_work_queue_r] for " + playerID + " has failed: " + err);
                        done();
                        return;
                    }

                    connection.query("UPDATE player_r SET status=$1,heartbeat_updated_dt=timezone('UTC',CURRENT_TIMESTAMP) WHERE player_id=$2", ["Active", playerID], function(err, results) {
                        if (err) {
                            logger.error("Tenant " + tenant + " Database update for [player_r] for " + playerID + " has failed: " + err);
                            done();
                            return;
                        }
                        done();
                    });
                });

                res.json({ "actions": collectActions });
            });

        logger.info("Tenant " + tenant + " Heartbeat service completed.");
    }); // Close connection
}); // End heartbeat

//------ Begin Add To HeartBeat
app.post('/addheartbeatwork', function(req, res) {
    var form = {};
    if (req.busboy) {
        req.busboy.on('field', function(key, value, keyTruncated, valueTruncated) {
            form[key] = value;
        });

        req.busboy.on('finish', function() {
            // Sanitize input
            var tenant = Tenant.decode(form.tenant_token);

            // Create a connection pool for Postgres queries
            getTenantDB(tenant).connect(function(err, connection, done) {
                if (err) {
                    logger.error("Tenant " + tenant + " connection failed at add heatbeat work: " + err);
                    res.status(500).send({ status: 500, error: "Tenant connection failed at add heartbeat work" });
                    done();
                    return;
                }

                // Insert into work queue
                connection.query("INSERT into heartbeat_work_queue_r (player_id, action, created_dt) VALUES($1,$2,timezone('UTC',CURRENT_TIMESTAMP));", [form.player_id, form.action],
                    function(err, results) {
                        if (err) {
                            logger.error("Tenant " + tenant + ` Error adding work for ${form.player_id} (${form.action}) - ` + err);
                            res.status(500).send({ status: 500, error: "Server error" });
                            done();
                            return;
                        } else {
                            res.status(200).send('Success');
                            done();
                        }

                    });
            });
        });
        req.pipe(req.busboy);
    }
}); // End add heartbeat

function decodeBearerToken(bearer) {
    if (!bearer) {
        // TODO: Change to a throw or some other error later
        return { tenant: config.tenant };
    }
    var token = bearer;
    if (token.startsWith('Bearer ')) {
        token = token.substring(7);
    }

    return jwt.decode(token);
}
// ------------------------------------- Begin Player Logs -------------------------------------
app.post('/playerlog', function(req, res) {

    logger.info("Beginning player log upload");

    //console.info(JSON.stringify(req.headers));

    var props = decodeBearerToken(req.headers['authorization']);
    var tenant = props.tenant;
    var playerid = props.playerid ? props.playerid : 0;

    //var playerID = parseInt(req.query.playerID);

    var fstream;
    if (req.busboy) {
        req.busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
            try {
                if (file) {
                    var location = config.storageLocation + '/logs/' + tenant;

                    logger.info("Tenant " + tenant + " Uploading: " + filename + " to " + location);

                    var now = moment(new Date);

                    var logfn = location + '/' + `Player ${playerid} ` + now.format("YYYYMMDDHHmmss") + '.log';

                    logger.info('Player log uploading to: ' + logfn);

                    fstream = fs.createWriteStream(logfn);
                    if (fstream) {
                        fstream.on('error', function(err) {
                            logger.error("Tenant " + tenant + " Player Log file upload Error: " + err);
                            res.status(500).send({ status: 500, error: "Server error" });
                        });

                        fstream.on('close', function() {
                            logger.info("Tenant " + tenant + " Player log successfully uploaded.");
                            res.send('success');
                        });
                        file.pipe(fstream);
                    }
                } else {
                    res.status(400).send({ status: 400, error: "upload file missing (undefined)" });
                }
            } catch (err) {
                logger.error(err);
                res.status(500).send({ status: 500, error: "Server Error" });
            }
        });
        req.pipe(req.busboy);
    } else {
        res.status(400).send({ status: 400, error: "Invalid request, payload not found" });
    }
});

// ------------------------------------- Begin Configuration Settings -------------------------------------
app.get('/configuration', function(req, res) {

    logger.info("Beginning configuration service");

    // Set URL string to variable incoming
    var incoming = req.query.pl;
    var tenant = Tenant.fromReq(req);

    try {
        // Parse incoming into JSON
        var parsed = JSON.parse(incoming);
        // Set parsed JSON string into variables
        var playerID = parsed.playerID;
    } catch (err) {
        logger.error("Tenant " + tenant + " JSON parse for the configuration service has failed: " + err);
        res.status(500).send({ status: 500, error: "JSON parse for the configuration service has failed" });
        return;

    }

    // Create a connectino pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at configuration: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at configuration" });
            done();
            return;
        }

        // Query the database and look for all items that need to be player settings
        connection.query('SELECT player_id::bigint AS playerID, player_name, street, city, state, floor, room, notes, zip, description, server, volume, \
        sleeptime, wakeuptime, screenshot, disablemouse, logLevel, heartbeatInterval::int, checkinInterval::int, screenshotInterval::int FROM player_r WHERE player_id=$1', [playerID],
            function(err, results) {
                if (err) { logger.error("Tenant " + tenant + " Database update for the configuration URL in [player_r] for " + playerID + " has failed: " + err); }

                try {
                    res.send(results.rows[0]);
                    done();
                } catch (err) {
                    logger.error("Tenant " + tenant + " The information for this playerID does not exist in the database " + err);
                    res.status(500).send({ status: 500, error: "The information for this playerID does not exist in the database" });
                    done();
                    return;
                }
            });
    });

}); // End configuration

function PasswordHash(saltAndPassword) {
    var hash = crypto.createHash('sha512');
    hash.update(saltAndPassword, 'utf8');
    return hash.digest('base64');
}


// ------------------------------------- Verify Routing ----------------------------------
app.get('/', function(req, res) {
    res.status(200).send({ status: 200, 'msg': "Is working !" });
});
//----------------------------------------------------------------------------------------


// ------------------------------------- Begin Login -------------------------------------
// used in code to attempt an automatic login
app.get('/login', function(req, res) {
    logger.info("Beginning Inview User Auto Login.");

    if (!req.query.rt) {
        res.status(400).send({ status: 400, error: "Invalid request URI" });
        return;
    }

    var rt;
    try {
        rt = JSON.parse(UrlSafeBase64.decode(req.query.rt));
    } catch (err) {
        res.status(400).send({ status: 400, error: "Invalid request URI (data decode failure)" });
        return;
    }

    var tenant = Tenant.decode(rt.tenant_token);

    // Create a connection pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at login: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at login" });
            done();
            return;
        }

        // Query the database and look for all items that need to be player settings
        connection.query('SELECT * from inview_users_r where UPPER(email) = UPPER($1)', [rt.username],
            function(err, results) {
                if (err) {
                    logger.error("Tenant " + tenant + ` User lookup for ${rt.username} failed ` + err);
                    res.status(500).send({ status: 500, error: "Server error" });
                    done();
                } else if (results.rows.length < 1) {
                    res.status(401).send({ status: 401, error: "Unauthorized" });
                    done();
                } else {
                    var data = results.rows[0];
                    var rememberHashed;
                    if (rt.rememberToken === undefined) {
                        rememberHashed = "nevermatch";
                    } else {
                        rememberHashed = PasswordHash(data.password_salt + rt.rememberToken);
                        // console.info(`Remember token incoming ${rt.rememberToken}`);
                        // console.info(`Hashed remember token   ${rememberHashed}`);
                        // console.info(`Token from the database ${data.remember_token}`);
                    }

                    if (data.remember_token == rememberHashed) {
                        // Authenticated
                        var issued = new Date();
                        var expires = new Date(issued.getTime() + (config.tokenExpiration * 1000));
                        var auth = {};
                        auth.id = data.inview_user_id;
                        auth.email = data.email;
                        auth.accessToken = jwt.sign({ userid: data.inview_user_id, email: data.email, tenant: tenant }, config.secret, { expiresIn: config.tokenExpiration });
                        //console.info('Token: ' + auth.accessToken);
                        auth.tokenType = 'bearer';
                        auth.expiresIn = config.tokenExpiration;
                        auth.issuedOn = issued.toString();
                        auth.expiresOn = expires.toString();
                        auth.webService = `${config.web.uri}:${config.web.port}`;
                        auth.stayLoggedIn = true;
                        auth.rememberUser = true;
                        auth.rememberToken = crypto.randomBytes(64).toString('base64');
                        var rthashed = PasswordHash(data.password_salt + auth.rememberToken);
                        // console.info('Generated rememberToken: ' + auth.rememberToken);
                        // console.info('Hashed    rememberToken: ' + rthashed);
                        delete data.password;
                        delete data.password_salt;
                        delete data.remember_token;
                        res.status(200).send({ loginDetails: auth, userDetails: data });

                        connection.query("UPDATE inview_users_r SET last_login=timezone('UTC',CURRENT_TIMESTAMP), remember_token = $2 where UPPER(email) = UPPER($1);", [rt.username, rthashed],
                            function(err, results) {
                                if (err) {
                                    logger.error("Tenant " + tenant + ` Error recording last_login for ${rt.username}` + err);
                                }
                                done();
                            });
                    } else {
                        res.status(401).send({ status: 401, error: "Unauthorized" });
                        done();
                    }
                }
            });
    });

});

// Used by the login form 
app.post('/login', function(req, res) {

    logger.info("Beginning Inview User Login.")

    var form = {};
    if (req.busboy) {
        req.busboy.on('field', function(key, value, keyTruncated, valueTruncated) {
            form[key] = value;
        });

        req.busboy.on('finish', function() {
            // Sanitize input
            form.rememberUser = (form.rememberUser === "on");
            form.stayLoggedIn = (form.stayLoggedIn === "on");
            var tenant = Tenant.decode(form.tenant_token);

            //console.info(JSON.stringify(form));
            // Create a connection pool for Postgres queries
            getTenantDB(tenant).connect(function(err, connection, done) {
                if (err) {
                    logger.error("Tenant " + tenant + " connection failed at login: " + err);
                    res.status(500).send({ status: 500, error: "Tenant connection failed at login" });
                    done();
                    return;
                }

                // Query the database and look for all items that need to be player settings
                connection.query('SELECT * from inview_users_r where UPPER(email) = UPPER($1)', [form.username],
                    function(err, results) {
                        if (err) {
                            logger.error("Tenant " + tenant + ` User lookup for ${form.username} failed ` + err);
                            res.status(500).send({ status: 500, error: "Server error" });
                            done();
                        } else if (results.rows.length < 1) {
                            res.status(401).send({ status: 401, error: "Unauthorized" });
                            done();
                        } else {
                            var data = results.rows[0];
                            var passwordHashed = PasswordHash(data.password_salt + form.password);

                            if (data.password == passwordHashed) {
                                // Authenticated
                                var issued = new Date();
                                var expires = new Date(issued.getTime() + (config.tokenExpiration * 1000));
                                var auth = {};
                                auth.id = data.inview_user_id;
                                auth.email = data.email;
                                auth.accessToken = jwt.sign({ userid: data.inview_user_id, email: data.email, tenant: tenant }, config.secret, { expiresIn: config.tokenExpiration });
                                //console.info('Token: ' + auth.accessToken);
                                auth.tokenType = 'bearer';
                                auth.expiresIn = config.tokenExpiration;
                                auth.issuedOn = issued.toString();
                                auth.expiresOn = expires.toString();
                                auth.webService = `${config.web.uri}:${config.web.port}`;
                                auth.stayLoggedIn = form.stayLoggedIn;
                                auth.rememberUser = form.rememberUser;
                                auth.rememberToken = crypto.randomBytes(64).toString('base64');
                                var rthashed = PasswordHash(data.password_salt + auth.rememberToken);
                                // console.info('Generated rememberToken: ' + auth.rememberToken);
                                // console.info('Hashed    rememberToken: ' + rthashed);
                                delete data.password;
                                delete data.password_salt;
                                delete data.remember_token;
                                res.status(200).send({ loginDetails: auth, userDetails: data });
                                connection.query("UPDATE inview_users_r SET last_login=timezone('UTC',CURRENT_TIMESTAMP), remember_token = $2 where UPPER(email) = UPPER($1);", [form.username, rthashed],
                                    function(err, results) {
                                        if (err) {
                                            logger.error("Tenant " + tenant + ` Error recording last_login for ${form.username}` + err);
                                        }
                                        done();
                                    });
                            } else {
                                res.status(401).send({ status: 401, error: "Unauthorized" });
                                done();
                            }
                        }

                    });
            });
        });
        req.pipe(req.busboy);
    }
}); // End Login

// ------------------------------------- Begin Logout ---------------------------------------------

// used in code to attempt an automatic login
app.get('/logout', function(req, res) {
    logger.info("Beginning Inview User Logout");

    var props = decodeBearerToken(req.headers['authorization']);

    var tenant = props.tenant;

    // Create a connection pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at login: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at logout" });
            done();
            return;
        }

        connection.query('SELECT * from inview_users_r where UPPER(email) = UPPER($1)', [props.email],
            function(err, results) {
                if (err) {
                    logger.error("Tenant " + tenant + ` User lookup for ${props.email} failed ` + err);
                    res.status(500).send({ status: 500, error: "Server error" });
                    done();
                } else if (results.rows.length < 1) {
                    res.status(401).send({ status: 401, error: "Unauthorized" });
                    done();
                } else {
                    var data = results.rows[0];

                    var rt = crypto.randomBytes(64).toString('base64');
                    var rthashed = PasswordHash(data.password_salt + rt);

                    connection.query("UPDATE inview_users_r SET remember_token = $2 where UPPER(email) = UPPER($1);", [props.email, rthashed],
                        function(err, results) {
                            if (err) {
                                logger.error("Tenant " + tenant + ` Error resetting remember token for ${props.email}` + err);
                                res.status(500).send({ status: 500, error: "Server error" });
                            } else {
                                res.status(200).send("Succeess");
                            }
                            done();
                        });
                }
            });
    });
});
//-------------------------------------- End Logout   ---------------------------------------------


// ------------------------------------- Begin Password Reset -------------------------------------
app.post('/passwordreset', function(req, res) {
    var form = {};
    if (req.busboy) {
        req.busboy.on('field', function(key, value, keyTruncated, valueTruncated) {
            form[key] = value;
        });
        req.busboy.on('finish', function() {
            if (!form.newpassword) {
                res.status(400).send({ status: 400, error: "Must supply a new password (newpassword)" });
                return;
            }

            var tenant = Tenant.decode(form.tenant_token);
            // Create a connectino pool for Postgres queries
            getTenantDB(tenant).connect(function(err, connection, done) {
                if (err) {
                    logger.error("Tenant " + tenant + " connection failed at password reset: " + err);
                    res.status(500).send({ status: 500, error: "Tenant connection failed at password reset" });
                    done();
                    return;
                }

                // Query the database and look for all items that need to be player settings
                connection.query('SELECT password, password_salt from inview_users_r where UPPER(email) = UPPER($1)', [form.username],
                    function(err, results) {
                        if (err) {
                            logger.error("Tenant " + tenant + ` User lookup for ${form.username} failed ` + err);
                            res.status(500).send({ status: 500, error: "Server Error" });
                            done();
                            return;
                        } else if (results.rows.length < 1) {
                            res.status(401).send({ status: 401, error: "Unauthorized" });
                            done();
                            return;
                        } else {
                            var credentials = results.rows[0];
                            hash = crypto.createHash('sha512');
                            hash.update(credentials.password_salt + form.password, 'utf8');
                            if (hash.digest('base64') == credentials.password) {
                                var newSalt = crypto.randomBytes(64).toString('base64');
                                var hash = crypto.createHash('sha512');
                                hash.update(newSalt + form.newpassword, 'utf8');
                                var password = hash.digest('base64');
                                connection.query("UPDATE inview_users_r SET password=$1, password_salt=$2, updated_date=timezone('UTC',CURRENT_TIMESTAMP) WHERE UPPER(email) = UPPER($3)", [password, newSalt, form.username.toLowerCase()],
                                    function(err, results) {
                                        if (err) {
                                            logger.error("Tenant " + tenant + ` User lookup for ${form.username} failed ` + err);
                                            res.status(500).send({ status: 500, error: "Server Error" });
                                            return;
                                        }
                                        // Reset
                                        res.status(200).send("Succeess");
                                        done();
                                        return;
                                    });
                            } else {
                                res.status(401).send({ status: 401, error: "Unauthorized" });
                                done();
                            }
                        }
                    });
            });
        })
        req.pipe(req.busboy);
    }

}); // End password reset

// ------------------------------------- Begin Pop Write -------------------------------------
app.put('/popwrite', function(req, res) {

    if (!req.query.data) {
        res.status(400).send({ status: 400, error: "Invalid request URI" });
        return;
    }

    var data;
    try {
        data = JSON.parse(UrlSafeBase64.decode(req.query.data));
        //console.info('Pop Data: ' + JSON.stringify(data));
    } catch (err) {
        res.status(400).send({ status: 400, error: "Invalid request URI (data decode failure)" });
        return;
    }

    var content = data.c;
    var playlist = data.p;
    var viewer = data.v;
    var when = data.w;
    when.s = new Date(when.s); // convert to an actual date

    var tenant = Tenant.fromReq(req);

    // Create a connection pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at popwrite: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at popwrite" });
            done();
            return;
        }

        // Write the pop data into the database
        connection.query('INSERT INTO pop_r (content_id,content_type,content_name,playlist_id,playlist_type,playlist_name,viewer_id,viewer_type,viewer_name,viewdatetime,viewduration) ' +
            'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);', [content.i, content.t, content.n, playlist.i, playlist.t, playlist.n, viewer.i, viewer.t, viewer.n, when.s, when.d],
            function(err, results) {
                if (err) {
                    logger.error("Tenant " + tenant + ` POP Write of ${JSON.stringify(data)} failed:` + err);
                    res.status(500).send({ status: 500, error: "Server Error" });
                    done();
                    return;
                } else {
                    res.status(200).send("Success");
                    done();
                    return;
                }
            });
    });
}); // End pop write


// ------------------------------------- Evaluate Dynamic Audience Rules -------------------------------------
// TODO: Pass inview User ID and run rules for just that ID
app.post('/dynamicAudience', function(req, res, next) {

    var tenant = Tenant.fromReq(req);

    // Create a connection pool for Postgres queries
    getTenantDB(tenant).connect(function(err, connection, done) {
        if (err) {
            logger.error("Tenant " + tenant + " connection failed at dynamic audience: " + err);
            res.status(500).send({ status: 500, error: "Tenant connection failed at dynamic audience" });
            done();
            return;
        }

        logger.info("Tenant " + tenant + " Starting Audience Rules..");
        // Query the database and grab all of the Inview User Id's
        connection.query('SELECT inview_user_id FROM inview_users_r',
            function(err, user) {
                if (err) {
                    logger.error("Tenant " + tenant + " Could not retireve Inview User Id's from the [inview_users_r] table: " + err);
                    done();
                    return;
                }

                // === Inline function for updating the audience using the rules
                function beginRulesAudience(ivID) {
                    // Setup rollback in case the transaction fails
                    var rollback = function(connection) {
                            connection.query('ROLLBACK', function(err) {
                                logger.error("Tenant " + tenant + " Rolling back the Rules transaction: " + err);
                                return done();
                            });
                        }
                        // Begin a transaction for rules
                    connection.query('BEGIN TRANSACTION', function(err, result) {
                        if (err) {
                            logger.error("Tenant " + tenant + " Transaction has been rolled back : " + err);
                            return rollback(connection);
                        }
                        updateDynamicInviewAudiences(ivID, connection, function(err, result) {
                            if (err) {
                                logger.error("Tenant " + tenant + " unable to update dynamic audience: " + err);
                                return rollback(connection);
                            }
                            connection.query('COMMIT', done);
                        });
                    });
                }


                if (user.rows.length > 0) {
                    logger.info("Tenant " + tenant + ` ${user.rows.length} inview users found`);
                    for (var i = 0; i < user.rows.length; i++) {
                        beginRulesAudience(user.rows[i].inview_user_id);
                    } // End if for each result
                } // End if there is a result
                res.status(200).send("Success");
                done();
            }); // End Query for all of the Inview User Id's
    });

}); // End dynamicAudience

// ------------------------------------- Player status background task -------------------------------------
var playerStatusUpdaterStart = require('./playerStatusUpdater');
playerStatusUpdaterStart();
// ---------------------------------- End player status background task ------------------------------------