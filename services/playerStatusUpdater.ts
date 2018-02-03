import log4js = require('log4js');
import * as moment from "moment";
let config = require('./config/settings'); // Import custom settings
import getTenantDB = require('./db'); // Create a DB pool connection
import getMasterDB = require('./dbMaster');  // Create DB pool for the master database.

log4js.configure('./config/log4js.json');
// Set the logging variable to the server category(optional)
let logger = log4js.getLogger('playerStatus');

let nextTenantFetch = moment();
let tenant_ids = [];

function playerStatusUpdaterStart() {
    if(config.playerStatus.enable) {
        playerStatusUpdater();
        setInterval(playerStatusUpdater, config.playerStatus.interval * 1000);
    }
}

function UpdateTenantsPlayerStatus(tenantDx) {
    try {
        if(tenantDx >= tenant_ids.length) {
            return;
        }

        let tenantId = tenant_ids[tenantDx];
        getTenantDB(tenantId).connect(function(err, connection) {
            try {
                if(err) {
                    return logger.error("Tenant " + tenantId + " UpdateTenantsPlayerStatus()->getTenantDB() failed:\n" + err);
                }

                connection.query("SELECT player_id, status, heartbeat_updated_dt, heartbeatinterval FROM player_r;", function(err, results) {
                    try {
                        connection.release();
                        if(err) {
                            logger.error("Tenant " + tenantId + " get player list failed:\n" + err);
                            return;
                        }

                        let inactiveCount = 0;
                        let pendingCount = 0;
                        let activeCount = 0;
                        for(let pdx = 0; pdx < results.rowCount; pdx++) {
                            let playerId = parseInt(results.rows[pdx].player_id);
                            let playerStatus = results.rows[pdx].status;
                            let heartbeat = moment(results.rows[pdx].heartbeat_updated_dt);
                            let interval = parseInt(results.rows[pdx].heartbeatinterval);

                            let offline = moment().utc().subtract(interval * config.playerStatus.offlineCount, 'm');
                            let newStatus = 'unknown';
                            if(heartbeat < offline) {
                                newStatus = 'Inactive';
                                inactiveCount++;
                            }
                            else {
                                let warning = moment().utc().add(interval * config.playerStatus.warningCount);
                                if(heartbeat < warning) {
                                    newStatus = 'Pending';
                                    pendingCount++;
                                }
                                else {
                                    newStatus = 'Active';
                                    activeCount++;
                                }
                            }

                            if(newStatus !== playerStatus) {
                                logger.debug("Tenant " + tenantId + ", Player " + playerId + " status changed from " + playerStatus + " to " + newStatus);
                                getTenantDB(tenantId).connect(function(err, connection) {
                                    if(err) {
                                    }
                                    connection.query(`UPDATE public.player_r SET status='${newStatus}' WHERE player_id = '${playerId}';`, function(err/*, results*/) {
                                        connection.release();
                                        if(err) {
                                            return logger.error("Player status update failed:\n" + err);
                                        }
                                    });
                                });
                            }
                        }

                        getTenantDB(tenantId).connect(function(err, connection) {
                            if(err) {
                                return logger.error("Tenant " + tenantId + " UpdateTenantsPlayerStatus()->getTenantDB() failed:\n" + err);
                            }

                            let statistics = {
                                activeCount: activeCount,
                                pendingCount: pendingCount,
                                inactiveCount: inactiveCount
                            };
                            logger.debug("Tenant " + tenantId + " players: Active=" + activeCount + ", Warning=" + pendingCount + ", Inactive=" + inactiveCount);
                            connection.query(`INSERT INTO public.player_statistics_r (name,value)VALUES('players','${JSON.stringify(statistics)}')`, function(err/*, results*/) {
                                connection.release();
                                if(err) {
                                    return logger.error(`"Player statistics update failed:\n${err}`);
                                }
                            });
                        });

                        // go do the next tenant's players.
                        UpdateTenantsPlayerStatus(++tenantDx);
                    } catch(err) {
                        return logger.error("Exception:\n" + err);
                    }
                });
            } catch(err) {
                return logger.error("Exception:\n" + err);
            }
        });
    } catch(err) {
        logger.error('Exception:\n' + err);
    }
}

function PurgeOldPlayerStatistics(tenant) {
    getTenantDB(tenant).connect(function(err, connection) {
        try {
            if(err) {
                logger.error(`Tenant ${tenant} - PurgeOldPlayerStatistics() -> getTenantDB() failed:\n${err}`);
            }

            connection.query(`DELETE FROM public.player_statistics_r WHERE createddate < NOW() - '${config.playerStatus.agePurgeStatisticsAfterHours} hour'::INTERVAL`, function(err) {
                connection.release();
                if(err) {
                    return logger.error(`Tenant ${tenant} - Purge old player statistics failed:\n${err}`);
                }
            });
        } catch(err) {
            logger.error(`Tenant ${tenant} - Exception:\n${err}`);
        }
    });
}

function playerStatusUpdater() {
    if(moment() >= nextTenantFetch) {
        getMasterDB().connect(function(err, connection) {
            try {
                if(err) {
                    return logger.error("Master DB connection failed:\n" + err);
                }

                connection.query('SELECT tenant_id FROM public.users WHERE users.id = users.tenant_id', function(err, results) {
                    try {
                        connection.release();
                        if(err) {
                            return logger.error('Failed to get tenants list:\n' + err);
                        }

                        nextTenantFetch = moment().add(config.playerStatus.tenantRefresh, 'm');
                        tenant_ids = [];
                        for(let ndx = 0; ndx < results.rowCount; ndx++) {
                            let tenantId = parseInt(results.rows[ndx].tenant_id);
                            tenant_ids.push(tenantId);
                            PurgeOldPlayerStatistics(tenantId);
                        }

                        UpdateTenantsPlayerStatus(0);
                    }
                    catch(err) {
                        return logger.error('Exception:\n' + err);
                    }
                });
            }
            catch(err) {
                return logger.error('Exception:\n' + err);
            }
        });
    }
    else {
        UpdateTenantsPlayerStatus(0);
    }
}

module.exports = playerStatusUpdaterStart;