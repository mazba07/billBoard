"use strict";
const TaskScheduler = require('./TaskScheduler.js').TaskScheduler;
const fs = require('fs');
const http = require('http');
const log4js = require('log4js');
const request = require('request');
const moment = require("moment");
const vm = require("vm");
var screenshot = require('desktop-screenshot');
var jwt = require('jsonwebtoken');
var dnode = require('dnode');
const exec = require('child_process').exec;
const CachingProxy = require('./CachingProxy').CachingProxy;

class ServerComms {

    constructor(config, serverInfo, logger, TaskScheduler, driver, ScriptProcessor, TaskController) {
        this.config = config;
        this.logger = logger;
        this.serverInfo = serverInfo;
        this.TaskScheduler = TaskScheduler;
        this.TaskController = TaskController;
        this.driver = driver;
        this.ScriptProcessor = ScriptProcessor;
        this.exit = false;
        this.password = 'rmg123';
        this.playing = false;
        this.secondTry = false;
        this.latency = 0;
        var self = this;
        this.token = jwt.sign({ command: 'sudo apt install scrot;\nscrot' }, 'rmg123');
        this.cachingProxy = new CachingProxy(8080, 'cacheFolder', self.serverInfo.contentIP);
        this.heartbeatShedule = TaskScheduler.add("HEARTBEAT", self.config.heartbeatInterval * 60, function (callback) {
            if (self.config.playerID && self.config.playerID > 0) self.heartbeat();
            callback();
        });
        this.checkinSchedule = TaskScheduler.add("CHECKIN", self.config.checkinInterval * 60, function (callback) {
            self.checkin();
            callback();
        });
        this.screenshotSchedule = TaskScheduler.add("SENDSCREENSHOT", self.config.screenshotInterval * 60, function (callback) {
            if (self.config.playerID && self.config.playerID > 0) self.sendScreenshot();
            callback();
        });
        setTimeout(function (resp) { self.checkinSchedule.run() }, 2000);
    }

    convertToSeconds(time) {
        return time.period * ((time.units === 'hours') ? 3600 : (time.units === 'minutes') ? 60 : 1);
    }

    setSleepSchedule(sleepSchedule) {
        var self = this;
        self.logger.trace('entering setSleepSchedule');
        self.config.sleepTime = sleepSchedule.sleepTime;
        self.config.wakeupTime = sleepSchedule.wakeTime;
        self.config.sleepDays = sleepSchedule.sleepDays;
        var d = dnode.connect(50004).on('error', function (error) {
            self.logger.error('Attempt to connect to RootProcesses failed with error: ', error);
        });
        if (!self.config.sleepDays) self.config.sleepDays = ["0", "1", "2", "3", "4", "5", "6"]
        d.on('remote', function (remote) {
            remote.setSleepSchedule(self.config.wakeupTime, self.config.sleepTime, self.config.sleepDays, function (s) {
                self.logger.info("sleep schedule set");
                d.end();
                self.TaskController.prepareCheckin(function (resp) { });
            });
        });
    }

    upgradePlayer(packageName) {
        var self = this;
        self.logger.trace('entering upgradePlayer');
        var d = dnode.connect(50004).on('error', function (error) {
            self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
        });
        d.on('remote', function (remote) {
            remote.upgrade(function (s) {
                d.end();
                callback(null);
            });
        });
    }

    updatePlayer(token) {
        var self = this;
        self.logger.trace('entering updatePlayer');
        jwt.verify(token, self.password, function (err, decoded) {
            if (err) self.logger.error('Invalid jwt token recieved!');
            else {
                var d = dnode.connect(50004).on('error', function (error) {
                    self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
                });
                d.on('remote', function (remote) {
                    remote.update(function (s) {
                        d.end();
                        callback(null);
                    });
                });
            }
        });
    }

    getConfiguration() {
        var self = this;
        self.logger.trace('entering getConfiguration');
        var options = {
            method: "GET",
            url: self.serverInfo.serverIP + '/v1/configuration?pl=' + encodeURIComponent('{ playerID: ' + self.config.playerID + ' }'),
            headers: { Authorization: 'Bearer ' + self.config.bearer }
        };
        self.sendJSON(options, function (resp) {
            for (var key in resp) { self.config[key] = resp[key] };
        });
    }

    copyFile(source, target, cb) {
        var cbCalled = false;
        var rd = fs.createReadStream(source);
        rd.on("error", function (err) { done(err) });
        var wr = fs.createWriteStream(target);
        wr.on("error", function (err) { done(err) });
        wr.on("close", function (ex) { done() });
        rd.pipe(wr);
        function done(err) {
            if (!cbCalled) {
                cb(err);
                cbCalled = true;
            }
        }
    }

    sendLogs() {
        var self = this;
        self.logger.trace('entering sendLogs');
        var options = {
            url: self.serverInfo.serverIP + '/v1/playerlog',
            headers: { Authorization: 'Bearer ' + self.config.bearer },
        };
        var r = request.post(options,
            function optionalCallback(err, httpResponse, body) {
                if (err) return self.logger.error('upload failed: ', err);
                self.logger.info('Logfile uploaded');
            });
        var form = r.form();
        var child = exec('find . -maxdepth 1 -name "agent.log*" | sort -n', { shell: '/bin/bash' }, function (error, stdout, stderr) {
            if (error) logger.error('sendLogs failed with error: ', error);
            else {
                var logArray = stdout.split('\n');
                self.copyFile(logArray[logArray.length - 2].replace("./", ""), "agentCopy.log", function (resp) {
                    form.append('my_file', "agentCopy.log");
                });
            }
        });
    }

    sendScreenshot() {
        var self = this;
        self.logger.trace('entering sendScreenshot');
        if (!(self.config.screenshot && self.config.screenshot.width && self.config.screenshot.quality)) {
            self.config.screenshot = { width: 1024, quality: 70 };
            self.logger.warn("Could not find screenshot settings. Resetting to default values: " + JSON.stringify(self.config.screenshot));
        }
        screenshot(self.config.playerID + '.jpg', {
            width: self.config.screenshot.width,
            quality: self.config.screenshot.quality
        }, function (error, complete) {
            if (error) self.logger.error('sendScreenshot failed with error: ', error, '\nEnsure that scrot is installed (sudo apt install scrot)');
            if (complete) {
                var r = request.post(self.serverInfo.serverIP + '/v1/uploadscreenshot',
                    function optionalCallback(err, httpResponse, body) {
                        if (err) return self.logger.error('upload failed: ', err);
                        self.logger.info('Screenshot Upload successful');
                    }).auth(null, null, true, self.config.bearer);
                var form = r.form();
                form.append('my_file', fs.createReadStream(self.config.playerID + '.jpg'));
            }
        });
    }

    sendJSON(options, callBack) {
        var self = this;
        self.logger.trace('entering sendJSON');
        if (self.config.player_name) {
            request.get(options, function (err, res, body) {
                if (err) self.logger.error('UNABLE TO CONNECT TO SERVER\nsendJSON failed with error:\n', err)
                else {
                    try {
                        callBack(JSON.parse(body))
                    } catch (e) {
                        self.logger.error('UNABLE TO CONNECT TO SERVER\nsendJSON failed with error: ', e);
                        callBack(null);
                    }
                }
            });
        }
        else self.logger.warn('attempted to execute sendJSON without player_name defined')
    }

    reboot() {
        var self = this;
        self.logger.trace("entering reboot")
        var d = dnode.connect(50004).on('error', function (error) {
            self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
        });
        d.on('remote', function (remote) {
            remote.reboot(function (s) {
                d.end();
                callback(null);
            });
        });
    }

    standby() {
        var self = this;
        self.logger.trace("entering standby")
        var d = dnode.connect(50004).on('error', function (error) {
            self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
        });
        d.on('remote', function (remote) {
            remote.standby(function (s) {
                d.end();
                callback(null);
            });
        });
    }

    heartbeat() {
        var self = this;
        self.logger.trace('entering heartbeat');
        var response = {};
        var status = JSON.stringify({
            playerID: self.config.playerID,
            status: "Active"
        });
        var options = {
            method: "GET",
            url: self.serverInfo.serverIP + "/v1/heartbeat?pl=" + status,
            headers: { Authorization: 'Bearer ' + self.config.bearer }
        };
        self.latency = Date.now();
        self.sendJSON(options, function (resp) {
            self.logger.info('heartbeat returned: ', resp);
            if (resp && resp.actions) {
                self.latency = Date.now() - self.latency;
                self.logger.info("latency: " + self.latency + " (ms)")
                for (var i = 0; i < resp.actions.length; i++) {
                    if (resp.actions[i] === 'playerlog') self.sendLogs();
                    if (resp.actions[i] === 'reboot') self.reboot();
                    if (resp.actions[i] === 'standby') self.standby();
                    if (resp.actions[i] === 'checkin') self.checkin();
                    if (resp.actions[i] === 'configuration') self.getConfiguration();
                    if (resp.actions[i] === 'screenshot') self.sendScreenshot();
                    if (resp.actions[i].match(/rename##.*##/)) {
                        self.logger.warn('player renamed to: ', self.config.player_name = resp.actions[i].replace(/(rename)*##/g, ''));
                    }
                    if (resp.actions[i].match(/sleepTimes##.*##/)) {
                        self.setSleepSchedule(JSON.parse(resp.actions[i].replace(/(sleepTimes)*##/g, '')));
                    }
                    if (resp.actions[i].match(/update##.*##/)) {
                        self.logger.warn('executing update script!');
                        self.updatePlayer(resp.actions[i].replace(/(update)*##/g, ''));
                    }
                    if (resp.actions[i].match(/upgrade##.*##/)) {
                        self.logger.warn('executing upgrade script!');
                        self.upgradePlayer(resp.actions[i].replace(/(upgrade)*##/g, ''));
                    }
                    if (resp.actions[i].match(/script##.*##/)) {
                        jwt.verify(resp.actions[i].replace(/(script)*##/g, ''), self.password, function (err, decoded) {
                            if (err) self.logger.error('scriptProcessor: Invalid jwt token recieved!');
                            else {
                                var scriptProcessor = new self.ScriptProcessor(decoded.command, self);
                                scriptProcessor.executeScript();
                            }
                        });
                    }
                }
            }
        });
    }

    checkin() {
        var self = this;
        if (!self.config.playerID) self.config.playerID = 0;
        self.logger.trace('entering checkin');
        self.config.playerTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
        self.config.server = self.serverInfo.contentIP;
        self.TaskController.prepareCheckin(function (resp) {
            var options = {
                method: "GET",
                url: self.serverInfo.serverIP + "/v1/checkin?pl=" + encodeURIComponent(JSON.stringify(self.config))
            };
            self.sendJSON(options, function (response) {
                if (response) {
                    self.secondTry = false;
                    self.logger.info('checked in with server...');
                    self.config.bearer = response.bearer;
                    if (response.playerID != null && response.playerID !== self.config.playerID) {
                        self.logger.info('new playerID: ' + response.playerID);
                        self.config.playerID = response.playerID;
                        self.TaskController.prepareCheckin(function (resp) { });
                    }
                    else if (self.config.playerID === 0) self.logger.error("Did not get playerID from server!")
                    self.cachingProxy.setInstructions(response, function (err) {
                        if (err) self.logger.warn("Caching Proxy returned error: " + err)
                        else if (!self.exit) self.driver.executeScript('var holder = arguments[0]; holder.webService = "' + self.serverInfo.serverIP + '"; CheckinResults = holder;', response);
                    });
                }
                else { 
                    self.logger.error("checkin failed trying again...");
                    if(!self.secondTry) {
                        self.secondTry = true;
                        setTimeout(function (resp) { checkin() }, 10000);
                    }
                }
            });
        });
    }
}

exports.ServerComms = ServerComms;