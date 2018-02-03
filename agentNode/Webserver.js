"use strict";
const http = require('http');
const async = require('async');
const util = require('util');
const fs = require('fs');
const formidable = require("formidable");
const Tasks = require('./Tasks.js');
const ServerComms = require('./ServerComms.js');
var express = require('express');
var bodyParser = require('body-parser');
var dnode = require('dnode');
var session = require('express-session');

class Webserver {

    constructor(config, serverInfo, logger, TaskController, Provisioner) {
        this.config = config;
        this.logger = logger;
        this.serverInfo = serverInfo;
        this.TaskController = TaskController;
        this.Provisioner = Provisioner;
        this.Tasks = new Tasks.Tasks(config, logger);
        this.serverCommunications = null;
        this.previousAP = {};
        this.loginFailed = false;
        this.username = "tenant"
        this.password = "rmg123";
    }

    setServerCommunications(serverCommunications) {
        var self = this;
        self.serverCommunications = serverCommunications;
    }

    run_cmd(cmd, args, callBack) {
        var self = this;
        self.logger.trace('entering run_cmd');
        var spawn = require('child_process').spawn;
        var child = spawn(cmd, args);
        var resp = "";
        child.stdout.on('data', function (buffer) { resp += buffer.toString() });
        child.stdout.on('end', function () { callBack(resp) });
    }

    isAlreadyConnected(callBack) {
        var self = this;
        self.logger.trace('entering isAlreadyConnected');
        self.run_cmd("iwgetid", ["-r"], function (resp) {
            if (self.config.accessPoint) {
                if (resp.trim() && resp.replace(/(\r\n|\n|\r)/gm, "") === self.config.accessPoint.ssid.trim()) callBack(true);
                else callBack(false);
            }
            else callBack(false);
        });
    }

    checkAuth(req, res, next) {
        if ((req.url === '/form' || req.url === '/download') && (!req.session || !req.session.authenticated)) {
            //res.render('unauthorised', { status: 403 });
            req.session.authenticated = false; 
            res.redirect('/')
            return;
        }
        next();
    }

    createConfigPage(port) {
        var self = this;
        self.configPagePort = port;
        self.logger.trace('entering createConfigPage');
        var configServer = express();
        configServer.use(express.static('css'));
        configServer.use(bodyParser.urlencoded({ extended: true }));
        configServer.use(session({ secret: 'example', resave: true, saveUninitialized: true, cookie: {maxAge: 60000 * 10} }));
        configServer.use(self.checkAuth);
        configServer.get('/', function (req, res) { 
            req.session.authenticated = false; 
            self.displayLogin(res) 
        });
        configServer.post('/', function (req, res) {
            self.processLogin(req, res, function (resp) {
                if (resp) {
                    self.loginFailed = false;
                    req.session.authenticated = true;
                    res.redirect('/form');
                } else {
                    self.loginFailed = true;
                    res.write('<script> window.location = "http://' + self.config.player_name + ':' + self.configPagePort + '";</script>');
                }
            });
        });
        configServer.get('/form', function (req, res) {
            self.TaskController.configurePlayer(function (response) {
                self.displayForm(res);
            });
        });
        var path = require('path');
        var mime = require('mime');
        configServer.get('/download', function (req, res) {
            var file = __dirname + '/agent.log';
            var filename = path.basename(file);
            var mimetype = mime.lookup(file);
            res.setHeader('Content-disposition', 'attachment; filename=' + filename);
            res.setHeader('Content-type', mimetype);
            var filestream = fs.createReadStream(file);
            filestream.pipe(res);
        });
        configServer.post('/form', function (req, res) {
            self.processForm(req, res, function (resp) {
                self.TaskController.configurePlayer(function (response) {
                    self.isAlreadyConnected(function (isAlreadyConnected) {
                        if (!isAlreadyConnected) {
                            if (JSON.stringify(self.previousAP) !== JSON.stringify(self.config.accessPoint)) {
                                self.previousAP = JSON.parse(JSON.stringify(self.config.accessPoint));
                                var d = dnode.connect(50004).on('error', function (error) {
                                    self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
                                });
                                d.on('remote', function (remote) {
                                    remote.makeConnection(self.config.accessPoint, function (s) {
                                        self.logger.info("WiFi connection created...");
                                        d.end();
                                    });
                                });
                            }
                        }
                    });
                });
            });
        });
        configServer.listen(self.configPagePort, function () {
            self.logger.info("config server listening on " + self.configPagePort);
        });
    }

    createDefaultPage(port) {
        var self = this;
        self.defaultPagePort = port;
        self.logger.trace('entering createDefaultPage');
        var defaultServer = http.createServer(function (req, res) {
            self.displayDefaultScreen(res);
        });
        defaultServer.listen(self.defaultPagePort);
        self.logger.info("default server listening on " + self.defaultPagePort);
    }

    makeSelector(item, options, callBack) {
        var self = this;
        this.logger.trace('entering makeSelector');
        var command = "";
        async.each(options, function (option, callBack) {
            if (item == option) {
                command += "<option selected=\"" + option + "\">" + option + "</option>";
                for (var k = 0; k < options.length; k++) {
                    if (options[k] !== item)
                        command += "\n<option value=\"" + options[k] + "\">" + options[k] + "</option>";
                }
            }
            callBack();
        }, function (err) {
            if (err) return this.logger.error("makeSelector returned error:\n" + err)
            callBack(command);
        })
    }

    getDisplayInfos(callBack) {
        var self = this;
        self.logger.trace('entering getDisplayInfos');
        var displayInfos = "";
        self.getScreenOrientation(function (screenOrientation) {
            for (var i = 0; i < self.config.displayInfos.length; i++) {
                var port = self.config.displayInfos[i].port;
                displayInfos += "<label style=\"padding-left:5em\" for=\"" + port + "\">" + port + ":</label>\n<select name=\"" + port + "\">\n";
                async.each(self.config.displayInfos[i].resolutions, function (reso, cb) {
                    if (self.config.displays) {
                        var match = self.config.displays.filter(function (e) { return e.port === self.config.displayInfos[i].port });
                        if (match[0] && match[0].resolution === reso)
                            displayInfos += "<option selected=\"" + reso + "\">" + reso + "</option>\n";
                        else displayInfos += "<option value=\"" + reso + "\">" + reso + "</option>\n";
                    }
                    else displayInfos += "<option value=\"" + reso + "\">" + reso + "</option>\n";
                    cb(null);
                }, function (err) {
                    if (err) return self.logger.error("getDisplayInfos returned error:\n" + err);
                    displayInfos += "</select>\n" + screenOrientation[i];
                });
            }
            callBack(displayInfos);
        });
    }

    addUnsetScreenOrientations(displayInfos, orientations, callBack) {
        var self = this;
        self.logger.trace('entering addUnsetScreenOrientations');
        async.each(displayInfos, function (display, callBack) {
            var orientation = "<select name=\"" + display.port + "Orientation\">\n";
            orientation += "<option selected=\"0 degrees\">0 degrees</option>\n<option value=\"90 degrees\">90 degrees</option>";
            orientation += "\n<option value=\"180 degrees\">180 degrees</option>\n<option value=\"270 degrees\">270 degrees</option>"
            orientation += "\n</select>\n<br />\n";
            orientations[self.config.displayInfos.indexOf(display)] = orientation;
            callBack();
        }, function (err) {
            if (err) return self.logger.error("getScreenOrientation returned error:\n" + err);
            callBack(orientations);
        });
    }

    getScreenOrientation(callBack) {
        var self = this;
        self.logger.trace('entering getScreenOrientation');
        var displayInfos = self.config.displayInfos.slice();
        var orientations = [];
        if (self.config.displays) {
            async.each(self.config.displays, function (display, callBack) {
                var orientation = "<select name=\"" + display.port + "Orientation\">\n";
                if (display.screenOrientation === '90 degrees')
                    orientation += "<option selected=\"90 degrees\">90 degrees</option>\n<option value=\"0 degrees\">0 degrees</option>"
                        + "\n<option value=\"180 degrees\">180 degrees</option>\n<option value=\"270 degrees\">270 degrees</option>";
                else if (display.screenOrientation === '180 degrees')
                    orientation += "<option selected=\"180 degrees\">180 degrees</option>\n<option value=\"0 degrees\">0 degrees</option>"
                        + "\n<option value=\"90 degrees\">90 degrees</option>\n<option value=\"270 degrees\">270 degrees</option>";
                else if (display.screenOrientation === '270 degrees')
                    orientation += "<option selected=\"270 degrees\">270 degrees</option>\n<option value=\"0 degrees\">0 degrees</option>"
                        + "\n<option value=\"90 degrees\">90 degrees</option>\n<option value=\"180 degrees\">180 degrees</option>";
                else
                    orientation += "<option selected=\"0 degrees\">0 degrees</option>\n<option value=\"90 degrees\">90 degrees</option>"
                        + "\n<option value=\"180 degrees\">180 degrees</option>\n<option value=\"270 degrees\">270 degrees</option>";
                orientation += "\n</select>\n<br />\n";
                var i = displayInfos.map(function (e) { return e.port }).indexOf(display.port);
                if (i > -1) displayInfos.splice(i, 1);
                orientations[self.config.displays.indexOf(display)] = orientation;
                callBack();
            }, function (err) {
                if (err) return self.logger.error("getScreenOrientation returned error:\n" + err);
                self.addUnsetScreenOrientations(displayInfos, orientations, function (orientations) {
                    callBack(orientations);
                });
            });
        }
        else {
            self.logger.warn("config.displays is missing from the config file!");
            self.addUnsetScreenOrientations(displayInfos, orientations, function (orientations) {
                callBack(orientations);
            });
        }
    }

    checkAccessPoint() {
        var self = this;
        self.logger.trace('entering checkAccessPoint');
        if (!self.config.accessPoint) {
            self.logger.warn('missing config.accesspoint information, it will be set to default');
            self.config.accessPoint = {
                "ssid": "", "mode": "", "username": "", "password": "", "security": [], "ip4": "", "defaultGateway": ""
            }
        }
    }

    displayLogin(res) {
        var self = this;
        self.logger.trace('entering displayLogin');
        fs.readFile('login.html', function (err, data) {
            if(self.loginFailed)
                data = data.toString().replace('<!--alert-->', '<script>swal("Invalid username or password.");</script>')
            res.write(data);
            res.end();
        });
    }

    processLogin(req, res, callback) {
        var self = this;
        self.logger.trace('entering processLogin');
        var form = new formidable.IncomingForm();
        form.parse(req, function (err, fields) {
            if (fields.username.trim() === self.username && fields.password.trim() === self.password) callback(true);
            else callback(false);
        });
    }
    

    displayForm(res) {
        var self = this;
        self.logger.trace('entering displayForm');
        var timeUnits = ['seconds', 'minutes', 'hours'];
        fs.readFile('player_config.html', function (err, data) {
            if (err) return self.logger.error("displayForm returned error: " + err);
            self.checkAccessPoint();
            var asyncTasks = [];
            data = data.toString().replace(/sleepTime\"\svalue=.*>/, "sleepTime\" value=\"" + self.config.sleepTime + "\"/>");
            data = data.replace(/serverIP\"\svalue=.*>/, 'serverIP" value="' + self.serverInfo.serverIP + '"/>');
            data = data.replace(/contentIP\"\svalue=.*>/, 'contentIP" value="' + self.serverInfo.contentIP + '"/>');
            data = data.replace(/tenantToken\"\svalue=.*>/, 'tenantToken" value="' + (self.config.tenant_token ? self.config.tenant_token : "") + '"/>');
            data = data.replace(/wakeupTime\"\svalue=.*>/, "wakeupTime\" value=\"" + self.config.wakeupTime + "\"/>");
            data = data.replace(/ssid\"\svalue=.*>/, "ssid\" value=\"" + self.config.accessPoint.ssid + "\"/>");
            data = data.replace(/username\"\svalue=.*>/, "username\" value=\"" + self.config.accessPoint.username + "\"/>");
            data = data.replace(/password\"\svalue=.*>/, "password\" value=\"" + self.config.accessPoint.password + "\"/>");
            data = data.replace(/volume\"\svalue=.*>/, "volume\" value=\"" + self.config.volume + "\"/>");
            data = data.replace(/checked=\"DM\"/, self.config.disableMouse ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"M\"/, (self.config.sleepDays.indexOf(1) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"T\"/, (self.config.sleepDays.indexOf(2) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"W\"/, (self.config.sleepDays.indexOf(3) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"TH\"/, (self.config.sleepDays.indexOf(4) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"F\"/, (self.config.sleepDays.indexOf(5) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"S\"/, (self.config.sleepDays.indexOf(6) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/checked=\"SU\"/, (self.config.sleepDays.indexOf(0) > -1) ? /checked=\"checked\"/ : "");
            data = data.replace(/hbPeriod\"\svalue=.*>/, "hbPeriod\" value=\"" + self.config.heartbeatInterval + "\"/>");
            data = data.replace(/playerName\"\svalue=.*>/, 'playerName" value="' + self.config.player_name + '"/>');
            asyncTasks.push(function (callBack) {
                self.makeSelector(self.config.logLevel, ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'off'], function (resp) {
                    data = data.replace("<!-- logLevel -->", resp);
                    callBack(null);
                });
            });
            data = data.replace(/cPeriod\"\svalue=.*>/, "cPeriod\" value=\"" + self.config.checkinInterval + "\"/>");
            data = data.replace(/sPeriod\"\svalue=.*>/, "sPeriod\" value=\"" + self.config.screenshotInterval + "\"/>");
            if (!self.config.screenshot) {
                self.config.screenshot = { width: 1024, quality: 70 };
                self.logger.warn("Could not find screenshot settings. Resetting to default values: " + JSON.stringify(self.config.screenshot));
            }
            if (!self.config.screenshot.width) self.config.screenshot.width = 1024
            data = data.replace(/screenshotWidth\"\svalue=.*>/, "screenshotWidth\" value=\"" + self.config.screenshot.width + "\"/>");
            if (!self.config.screenshot.quality) self.config.screenshot.quality = 70
            data = data.replace(/screenshotQuality\"\svalue=.*>/, "screenshotQuality\" value=\"" + self.config.screenshot.quality + "\"/>");
            if (self.config.accessPoint.mode === 'adhoc') {
                data = data.replace(/value=\"adhoc/, "selected=\"adhoc");
                data = data.replace(/selected=\"client/, "value=\"client");
            }
            else {
                data = data.replace(/value=\"client/, "selected=\"client");
                data = data.replace(/selected=\"adhoc/, "value=\"adhoc");
            }
            var displayInfos = "";
            var wifiOptions = "";
            var soundOptions = ""
            var screenOrientation = "";
            asyncTasks.push(function (callBack) {
                self.getDisplayInfos(function (resp) {
                    displayInfos = resp;
                    callBack(null);
                });
            });
            asyncTasks.push(function (callBack) {
                for(var i = 0; i < self.config.soundSinks.length; i++) {
                    var name = self.config.soundSinks[i].name;
                    if(self.config.soundOutput === self.config.soundSinks[i].index)
                        soundOptions += '\n<option selected="' + name + '">' + name + "</option>"
                    else soundOptions += '\n<option value="' + name + '">' + name + "</option>"
                }
                callBack(null);
            });
            asyncTasks.push(function (callBack) {
                self.Tasks.getCurrentConnection(function (currentConnection) {
                    self.Tasks.getWifiList(function (resp) {
                        for (var i = 0; i < resp.length; i++) {
                            if (resp[i].ssid) {
                                if (currentConnection && resp[i].ssid.trim() === currentConnection.trim()) {
                                    wifiOptions += "\n<option selected=\"";
                                    currentConnection = "@";
                                }
                                else wifiOptions += "\n<option value=\"";
                                wifiOptions += resp[i].ssid + "\">" + resp[i].ssid + " | " + resp[i].bars + " | " + resp[i].security + "</option>";
                            }
                        }
                        callBack(null);
                    });
                });
            });
            async.parallel(asyncTasks, function () {
                data = data.replace(/<!--resolution-->/, displayInfos);
                data = data.replace(/<!--wifiList-->/, wifiOptions);
                data = data.replace(/<!--soundList-->/, soundOptions);
                res.write(data);
                res.end();
            });
        });
    }

    convertToSeconds(time) {
        return time.period * ((time.units === 'hours') ? 3600 : (time.units === 'minutes') ? 60 : 1);
    }

    processForm(req, res, callback) {
        var self = this;
        self.logger.trace('entering processForm');
        var form = new formidable.IncomingForm();
        form.parse(req, function (err, fields) {
            setTimeout(function (resp) { res.redirect('/form') }, 2000);
            console.log(JSON.stringify(fields))
            if (err) return self.logger.error("processForm returned error:\n" + err);
            //res.send('<script> window.location = "' + self.config.player_name + ':' + self.configPagePort + '"; alert("Changes will be applied shortly");</script>');
            self.serverInfo.serverIP = fields.serverIP;
            self.serverInfo.contentIP = fields.contentIP;
            if(self.config.tenant_token != fields.tenantToken) {
                self.config.provisionedManually = "true";
                self.config.tenant_token = fields.tenantToken;
                self.Provisioner.checkProvisioningStatus();
            }
            for(var i = 0; i < self.config.soundSinks.length; i++) {
                if(fields.soundList === self.config.soundSinks[i].name)
                    self.config.soundOutput = self.config.soundSinks[i].index
            }
            self.config.volume = fields.volume;
            self.config.sleepTime = fields.sleepTime;
            self.config.wakeupTime = fields.wakeupTime;
            if (!self.config.displays) self.config.displays = [];
            for (var i = 0; i < self.config.displayInfos.length; i++) {
                var index = self.config.displays.map(function (e) { return e.port }).indexOf(self.config.displayInfos[i].port);
                if (index > -1) {
                    self.config.displays[index].resolution = fields[self.config.displayInfos[i].port];
                    self.config.displays[index].screenOrientation = fields[self.config.displayInfos[i].port + 'Orientation'];
                }
                else {
                    self.config.displays.push({
                        port: self.config.displayInfos[i].port,
                        resolution: fields[self.config.displayInfos[i].port],
                        screenOrientation: fields[self.config.displayInfos[i].port + 'Orientation']
                    });
                }
            }
            self.config.disableMouse = fields.disableMouse;
            if (fields.Monday) {
                if (!(self.config.sleepDays.indexOf(1) > -1)) self.config.sleepDays.push(1);
            }
            else {
                if (self.config.sleepDays.indexOf(1) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(1), 1);
            }
            if (fields.Tuesday) {
                if (!(self.config.sleepDays.indexOf(2) > -1)) self.config.sleepDays.push(2);
            }
            else {
                if (self.config.sleepDays.indexOf(2) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(2), 1);
            }
            if (fields.Wednesday) {
                if (!(self.config.sleepDays.indexOf(3) > -1)) self.config.sleepDays.push(3);
            }
            else {
                if (self.config.sleepDays.indexOf(3) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(3), 1);
            }
            if (fields.Thursday) {
                if (!(self.config.sleepDays.indexOf(4) > -1)) self.config.sleepDays.push(4);
            }
            else {
                if (self.config.sleepDays.indexOf(4) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(4), 1);
            }
            if (fields.Friday) {
                if (!(self.config.sleepDays.indexOf(5) > -1)) self.config.sleepDays.push(5);
            }
            else {
                if (self.config.sleepDays.indexOf(5) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(5), 1);
            }
            if (fields.Saturday) {
                if (!(self.config.sleepDays.indexOf(6) > -1)) self.config.sleepDays.push(6);
            }
            else {
                if (self.config.sleepDays.indexOf(6) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(6), 1);
            }
            if (fields.Sunday) {
                if (!(self.config.sleepDays.indexOf(0) > -1)) self.config.sleepDays.push(0);
            }
            else {
                if (self.config.sleepDays.indexOf(0) > -1) self.config.sleepDays.splice(self.config.sleepDays.indexOf(0), 1);
            }
            self.config.accessPoint.mode = fields.mode;
            if (fields.mode.trim() === 'client' && fields.wifiList)
                self.config.accessPoint.ssid = fields.wifiList.split('*').join('').trim().split('|')[0];
            else if (fields.mode === 'adhoc')
                self.config.accessPoint.ssid = fields.ssid;
            self.config.accessPoint.username = fields.username;
            self.config.accessPoint.password = fields.password;
            self.config.accessPoint.security = fields.security ? fields.security.split('|')[2].split(" ") : "";
            if (self.config.heartbeatInterval !== fields.hbPeriod && self.serverCommunications)
                self.serverCommunications.heartbeatShedule.rate(fields.hbPeriod * 60);
            self.config.heartbeatInterval = fields.hbPeriod;
            if (self.config.checkinInterval !== fields.cPeriod && self.serverCommunications)
                self.serverCommunications.checkinSchedule.rate(fields.cPeriod * 60);
            self.config.checkinInterval = fields.cPeriod;
            if (self.config.screenshotInterval !== fields.sPeriod && self.serverCommunications)
                self.serverCommunications.screenshotSchedule.rate(fields.sPeriod * 60);
            self.config.screenshot = { width: fields.screenshotWidth, quality: fields.screenshotQuality };
            self.config.screenshotInterval = fields.sPeriod;
            self.config.player_name = fields.playerName;
            self.Tasks.setPlayerName();
            self.config.logLevel = fields.logLevel;
            self.logger.setLevel(fields.logLevel);
            callback(null);
        });
    }

    displayDefaultScreen(res) {
        var self = this;
        self.logger.trace('entering displayDefaultScreen');
        fs.readFile('defaultPage.html', function (err, data) {
            if (err) return self.logger.error("displayDefaultScreen returned error:\n" + err);
            var macAddress = '';
            for (var i = 0; i < self.config.macAddress.length; i++)
                macAddress += '<strong style="padding-left:2em">' + self.config.macAddress[i].interface
                    + ': </strong><span>' + self.config.macAddress[i].address + '</span><br /><br />\n';
            data = data.toString().replace('<!--mac-->', macAddress);
            data = data.replace(/href=\".*\"/, 'href="' + self.config.player_name + ':' + self.configPagePort + '/"');
            res.write(data);
            res.end();
        });
    }
}

exports.Webserver = Webserver;