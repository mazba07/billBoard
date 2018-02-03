/*
 * @Author: Stephen Kuehl 
 * @Date: 2016-11-22 11:37:53 
 * @Last Modified by: Stephen Kuehl
 * @Last Modified time: 2017-02-22 15:23:59
 *
 * 2017-02-28 14:26 - Raymond Rogers: added settings for player status update task
 */

var config = {};

config.database = {};
config.web = {};
config.log = {};
config.OAuth = {};
config.playerStatus = {};

config.database.host = '172.25.7.20';
config.database.port = '5432';
config.database.user = 'svc1';
config.database.password = 'abc123';
config.database.connectionLimit = 100;
config.database.idleTimeout = 30000;
config.database.rowlimit = 30;
config.database.master_db = 'devops3';

config.web.uri = 'http://v2.maestro.rmg.local';
config.web.port = 8085;
config.routePrefix = '/ws';

// Root location of logs and screenshots directories (uncomment out next line to specify a locaion)
//config.storageLocation = 'your location here';

config.OAuth.token = 'cm1nbmV0d29ya3NtYWVzdHJv';
config.OAuth.authStatus = 'off';

config.enableAuthentication = false;
config.secret = 'TeN%eU4d^UG4RTXM7m@Uq!mTkBdPMa!rmdJAX7^W6hGTj*!EyAwMu@hrJWqn6E85';
config.tenant = 1;
config.tokenExpiration = 1209600; // 14 days in seconds (14 * 24 * 60 * 60)

// config.log.level = 'OFF/FATAL/ERROR/WARN/INFO/DEBUG/TRACE/ALL';

config.playerStatus.enable = true;
config.playerStatus.interval = 60;
config.playerStatus.warningCount = 3;
config.playerStatus.offlineCount = 5;
config.playerStatus.tenantRefresh = 30;
config.playerStatus.agePurgeStatisticsAfterHours = 72;

module.exports = config;