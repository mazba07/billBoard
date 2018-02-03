const fs = require('fs');
const ServerComms = require('./ServerComms.js');
const Webserver = require('./Webserver.js');
const TaskScheduler = require('./TaskScheduler.js').TaskScheduler;
const Tasks = require('./Tasks.js');
const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const log4js = require('log4js');
const uriParse = require("url-parse");
const exec = require('child_process').exec;
const vm = require("vm");
const os = require("os");
const disk = require('diskusage');
var dnode = require('dnode');
var express = require('express');
const request = require('request');
require('chromedriver');

const configPagePort = 50001;
const defaultPagePort = 50002;
const provisionPagePort = 50003;

log4js.configure({
    appenders: [
        { type: 'console' },
        { type: 'file', filename: 'agent.log', category: 'agent', maxLogSize: 1000000, backups: 3 }
    ]
});

var isWindow = "~";
var logger = log4js.getLogger('agent');

try {
    var config = require('./config.json');
    if (fs.existsSync('~/tmpAgent/tmpAgentConfig.json')) {
        config = require('~/tmpAgent/tmpAgentConfig.json');
        var child = exec("rm -r ~/tmpAgent/", { shell: '/bin/bash' }, function (error, stdout, stderr) {
            if (error) logger.error('error removing ~/tmpAgent/', error);
        });
    }
} catch (e) {
    logger.error("reading config.json returned error: " + e)
    logger.error("config.json is corrupted and will be overwritten");
    config = {};
}
try {
    var serverInfo = require('./serverInfo.json');
} catch (e) {
    logger.error("reading serverInfo.json returned error: " + e)
    logger.error("serverInfo.json is corrupted and will be restored to default");
    serverInfo = {
        "serverIP": "",
        "contentIP": ""
    }
}
try {
    var provisioningInfo = require('./provisioning.json');
} catch (e) {
    logger.error("reading provisioning.json returned error: " + e)
    logger.error("provisioning.json is corrupted and will be restored to default");
    provisioningInfo = {
        "provisioningUI": "https://korbytdev.com/players",
        "provisioningWS": "https://korbytdev.com/ws"
    }
}
validateIntervals();

var numberOfMonitors = config.displayInfos ? config.displayInfos.length : 1;

var driver = new webdriver.Builder();

applyChromeSettings(function (resp) { if (numberOfMonitors > 1) spanWindowAcrossMonitors() });

if (!config.logLevel) config.logLevel = "info";
logger.setLevel(config.logLevel);

var scheduler = new TaskScheduler({ tickRate: 60000 });

var tasks = new Tasks.Tasks(config, logger);

if (!config.player_name) config.player_name = os.hostname();
config.osArch = os.arch();
config.platform = os.platform();
config.release = os.release();
config.cpus = os.cpus();
config.totalmem = convertToHumanReadable(os.totalmem(), false);
config.networkInterfaces = os.networkInterfaces();
tasks.getMacAddress(function (resp) { });
tasks.setOSVersion(function (resp) { });
tasks.setGraphicsCard(function (resp) { });
tasks.disableMonitorSleep(function (resp) { });
process.stdin.resume();

var ScriptProcessor = function (scriptString, serverCommunications) {
    this._scriptString = scriptString;
    this._serverCommunications = serverCommunications;
}

ScriptProcessor.prototype.executeScript = function () {
    logger.warn('attempting to execute script from server...');
    eval(this._scriptString);
}

var TaskController = function () {
    this.configurePlayer = function (cb) {
        logger.trace('entering configurePlayer');
        tasks.getAudioSinks(function (resp) {
            tasks.setAudioSink(function (resp) {
                tasks.setVolume(function (resp) {
                    tasks.getVolume(function (resp) {
                        tasks.setDisplayInfos(function (resp) {
                            tasks.configureDisplay(function (resp) {
                                tasks.setSleepSchedule(function (resp) {
                                    config.uptime = os.uptime();
                                    config.freemem = convertToHumanReadable(os.freemem(), false);
                                    validateIntervals();
                                    toggleMouse();
                                    applyChromeSettings(function (resp) {
                                        if (config.displayInfos && numberOfMonitors != config.displayInfos.length) {
                                            spanWindowAcrossMonitors();
                                            numberOfMonitors = config.displayInfos.length;
                                        }
                                    });
                                    writeToFiles(function (resp) { cb(null) });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
    this.prepareCheckin = function (callback) {
        logger.trace('entering prepareCheckin');
        getCPUUsage(function (resp) {
            getDiskSpace(function (resp) {
                writeToFiles(function (resp) { callback(null) });
            });
        });
    }
}
var taskController = new TaskController();
taskController.configurePlayer(function (resp) {
    if (!config.displays) config.displays = [];
    var child = exec("xrandr | fgrep '*' | awk '{ print$1 }'", { shell: '/bin/bash' }, function (error, stdout, stderr) {
        var resolutions = stdout.split('\n');
        for (var i = 0; i < config.displayInfos.length; i++) {
            var index = config.displays.map(function (e) { return e.port }).indexOf(config.displayInfos[i].port);
            if (index < 0) {
                config.displays.push({
                    port: config.displayInfos[i].port,
                    resolution: resolutions[i] ? resolutions[i] : "",
                    screenOrientation: "0 degrees"
                });
            }
        }
    });
});

var Provisioner = function () {
    this.provision = function () {
        checkProvisioning(function (provisioned) {
            var serverCommunications = new ServerComms.ServerComms(config, serverInfo, logger, scheduler, driver, ScriptProcessor, taskController);
            webserver.setServerCommunications(serverCommunications);
        });
    }
    this.checkProvisioningStatus = function () {
        if (serverInfo.serverIP && serverInfo.contentIP && config.tenant_token)
            driver.get(serverInfo.contentIP + 'prt/device.html');
    }
}
var provisioner = new Provisioner();
var webserver = new Webserver.Webserver(config, serverInfo, logger, taskController, provisioner);
webserver.createConfigPage(configPagePort);
webserver.createDefaultPage(defaultPagePort);
provisioner.provision();

/* ------------------------------------------------------- functions ------------------------------------------------------- */

function getProvisioningStatus(callback) {
    request.get(serverInfo.contentIP + 'prt/device.html', function (err, res, body) {
        if (err) {
            logger.warn("unable to connect to server trying again...");
            setTimeout(function (resp) { getProvisioningStatus(function (resp) { callback(null) }) }, 5000);
        }
        else {
            driver.get(serverInfo.contentIP + 'prt/device.html');
            callback(null);
        }
    });
}

function checkProvisioning(callback) {
    if (config.provisionedManually === "true" && serverInfo.serverIP && serverInfo.contentIP && config.tenant_token)
        getProvisioningStatus(function (resp) { callback(null) });
    else preProvision(function (resp) { callback(null) });
}

function preProvision(callback) {
    provisionPlayer(function (resp) {
        if (!resp) {
            logger.info("player provisioned!")
            driver.get(serverInfo.contentIP + 'prt/device.html')
            callback(null)
        }
        else {
            setTimeout(function (resp) { preProvision(function (r) { callback(null) }) }, 20000);
        }
    });
}

function provisionPlayer(callback) {
    logger.trace('entering provisionPlayer');
    var child = exec("ifconfig | grep HWaddr | awk 'NF>1{print $1 \" \" $NF}'", { shell: '/bin/bash' }, function (error, stdout, stderr) {
        if (error) { logger.error("provisionPlayer returned error: ", error); callback(null) }
        var mac = (stdout.split('\n')[0].split(' '))[1];
        if (mac) {
            var token = api.encodeMac(mac.replace(/\W/g, '').toLowerCase());
            checkProvisioningStatus(token, function (resp) {
                if (resp) { callback(null) }
                else {
                    createProvisionPage(token, function (resp) {
                        driver.get('localhost:' + provisionPagePort);
                    });
                    var intervalID = setInterval(function () {
                        checkProvisioningStatus(token, function (resp) {
                            if (resp) {
                                clearInterval(intervalID);
                                callback(null);
                            }
                        });
                    }, 20000);
                }
            });
        }
        else callback(true);
    });
}

function createProvisionPage(token, callback) {
    logger.trace('entering createProvisionPage');
    var provisionServer = express();
    provisionServer.get('/', function (req, res) {
        fs.readFile('provision.html', function (err, data) {
            if (err) return logger.error("displayProvisionPage returned error: " + err);
            data = data.toString().replace("<!-- token -->", token);
            data = data.replace("<playername>", os.hostname())
            data = data.replace(/<url>/g, provisioningInfo.provisioningUI)
            res.write(data);
            res.end();
        });
    });
    provisionServer.listen(provisionPagePort, function () {
        logger.info("provision server listening on " + provisionPagePort);
        callback(null);
    });
}

function checkProvisioningStatus(token, callback) {
    logger.trace('entering checkProvisioningStatus');
    request({
        url: provisioningInfo.provisioningWS + '/v1/check?pt=' + token,
        json: true
    }, function (error, response, body) {
        if (error) {
            logger.error("checkProvisioningStatus returned error: " + error);
            callback(false);
        }
        else if (response.body.provisioned) {
            config.provisionedManually = "false"
            serverInfo.contentIP = response.body.cms + '/';
            serverInfo.serverIP = response.body.webService;
            config.tenant_token = response.body.tenant_token;
            writeToFiles(function (resp) { callback(true) });
        }
        else callback(false);
    });
}

function configureCompizSettings() {
    logger.trace('entering configureCompizSettings');
    var child = exec("xdpyinfo | awk '/dimensions/{print $2}'", { shell: '/bin/bash' }, function (error, stdout, stderr) {
        if (error) { logger.error("configureCompizSettings returned error: ", error); return }
        fs.writeFile('agentCompiz.profile', '[core]\ns0_detect_outputs = false\ns0_outputs = ' + stdout.trim(), 'utf8', function (error) {
            if (error) { logger.error("configureCompizSettings returned error: ", error); return }
            var child = exec("./scriptComp.py agentCompiz.profile", { shell: '/bin/bash' }, function (error, stdout, stderr) {
                if (error) logger.error("configureCompizSettings returned error: ", error)
                else var child = exec("compiz --replace --display :0 &", { shell: '/bin/bash' }, function (error, stdout, stderr) { });
            });
        });
    });
}

function spanWindowAcrossMonitors() {
    logger.trace('entering spanWindowAcrossMonitors');
    setTimeout(function (resp) { configureCompizSettings() }, 2000);
}

function applyChromeSettings(callback) {
    logger.trace('entering applyChromeSettings');
    if (config.isWindow !== isWindow) {
        if ('undefined' !== typeof driver.session_) driver.close();
        var options = new chrome.Options();
        //options.addArguments("--no-sandbox");
        options.addArguments("--start-maximized");
        options.addArguments("--disable-infobars");
        if (config.isWindow != "true") options.addArguments("--kiosk");
        driver = new webdriver.Builder()
            .forBrowser('chrome')
            .withCapabilities(options.toCapabilities()).build();
        //driver.get(serverInfo.contentIP + 'prt/device.html');
        isWindow = config.isWindow;
        callback(true);
    }
    else callback(false);
}

function getCPUUsage(callback) {
    logger.trace('entering getCPUUsage');
    var cpus = os.cpus();
    var cpu = cpus[0], total = 0, processTotal = 0, strPercent = '';
    for (type in cpu.times) total += cpu.times[type];
    for (type in cpu.times) {
        var percent = 100 * cpu.times[type] / total;
        strPercent += type + ' ' + percent + '%|';
        if (type != 'idle') processTotal += percent;
    }
    config.cpuUsage = processTotal;
    callback(null);
}

function getDiskSpace(callback) {
    logger.trace('entering getDiskSpace');
    disk.check('/', function (error, info) {
        if (error) logger.error("getDiskSpace failed with error: ", error);
        else config.diskSpace = convertToHumanReadable(info.available, true);
        callback(null);
    });
}

function toggleMouse() {
    logger.trace('entering toggleMouse');
    if (config.disableMouse) driver.executeScript("document.body.style.cursor = 'none';");
    else driver.executeScript("document.body.style.cursor = 'default';");
}

function convertToHumanReadable(bytes, isDiskSpace) {
    logger.trace('entering convertToHumanReadable');
    var thresh = isDiskSpace ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) return bytes + ' B';
    var units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    var u = -1;
    do { bytes /= thresh; ++u } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}

function writeToFiles(callback) {
    fs.writeFile("serverInfo.json", JSON.stringify(serverInfo, null, 4), function (err) {
        if (err) { logger.error('Error writing to serverInfo.json with error: ', err); callback(null) }
        fs.writeFile("config.json", JSON.stringify(config, null, 4), function (err) {
            if (err) { logger.error('Error writing to config.json with error: ', err); callback(null) }
            callback(null);
        });
    });
}

var api = {
    _keyStr: '0BCD1EF2GH3JK4LM5NP6QR7ST8VW9XYZ',

    encode: function (n) {
        var output = '';

        while (n > 0) {
            var p = n % 32;
            n = Math.floor(n / 32);
            output = api._keyStr.charAt(p) + output;
        }

        if (output.length < 6) {
            var half = Math.floor(output.length / 2);
            return output.substr(0, half) + '-' + output.substr(half);
        } else {
            if (output.length < 10) {
                output = '00000'.substr(0, 10 - output.length) + output;
            }
            return output.substr(0, 5) + '-' + output.substr(5);
        }
    },

    genCheckDigits: function (n) {
        var digits = n.toString();
        var cs = 0;
        var xs = 0;
        for (var i = 0; i < digits.length; i++) {
            var d = parseInt(digits.charAt(i));
            cs += d;
            xs ^= d;
        }
        return (cs % 10).toString() + (xs % 10).toString();
    },

    encodeMac: function (input) {
        var clean = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
        var n = parseInt(clean, 16);
        return api.encode(n) + '-' + api.genCheckDigits(n);
    },

    decode: function (input) {
        input = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
        var n = 0;
        for (var i = 0; i < input.length - 2; i++) {
            n = n * 32;
            n = n + api._keyStr.indexOf(input.charAt(i));
        }

        return n;
    },

    validate: function (input) {
        try {
            var clean = input.toUpperCase().replace(/[^0-9A-Z]/gi, '');
            var cd1 = clean.substr(clean.length - 2, 2);
            var cd2 = api.genCheckDigits(api.decode(input));
            return (cd1 == cd2);
        } catch (err) {
            console.error(err);
            return false;
        }
    },

    encodeTenant: function (t) {
        var n = (t * 1415) ^ 7654321;

        return api.encode(n) + '-' + api.genCheckDigits(n);
    },

    decodeTenant: function (tenant) {
        var n = api.decode(tenant);
        return Math.floor((n ^ 7654321) / 1415);
    }
}

function validateIntervals() {
    logger.trace('entering validateIntervals');
    if (!config.heartbeatInterval || config.heartbeatInterval < 5) {
        logger.warn("config.heartbeatInterval was empty or less than 5. Will be changed to 5")
        config.heartbeatInterval = 5;
    }
    if (!config.checkinInterval || config.checkinInterval < 15) {
        logger.warn("config.checkinInterval was empty or less than 15. Will be changed to 15")
        config.checkinInterval = 15;
    }
    if (!config.screenshotInterval || config.screenshotInterval < 20) {
        logger.warn("config.screenshotInterval was empty or less than 20. Will be changed to 20")
        config.screenshotInterval = 20;
    }
}