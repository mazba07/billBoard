"use strict";
const exec = require('child_process').exec;
const async = require('async');
const log4js = require('log4js');
const path = require('path');
var dnode = require('dnode');

class Tasks {

    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.previousAP = {};
    }

    childProcess(cmd, callBack) {
        var self = this;
        self.logger.trace('entering childProcess');
        var child = exec(cmd, { shell: '/bin/bash' }, function (error, stdout, stderr) {
            if (error) self.logger.error('childProcess failed with error: ', error);
        });
        var resp = "";
        child.stdout.on('data', function (buffer) { resp += buffer.toString() });
        child.stdout.on('end', function () { callBack(resp) });
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

    configureDisplay(callback) {
        var self = this;
        self.logger.trace('entering configureDisplay');
        var command = "";
        self.childProcess("xrandr | fgrep '*' | awk '{ print$1 }'", function (currentResolutions) {
            if (self.config.displays && self.config.displayInfos) {
                async.each(self.config.displays, function (display, callback) {
                    self.config.displayInfos.toString();
                    var port = self.config.displayInfos.filter(function (e) { return e.port === display.port })[0];
                    if (display.port && port) {
                        if (port.resolutions.indexOf(display.resolution) > -1) {
                            var orientation;
                            switch (display.screenOrientation) {
                                case '0 degrees': orientation = 'normal'; break;
                                case '90 degrees': orientation = 'right'; break;
                                case '180 degrees': orientation = 'inverted'; break;
                                case '270 degrees': orientation = 'left'; break;
                                default: orientation = 'normal';
                            }
                            command += "xrandr --auto --output " + display.port + " --mode " + display.resolution + " --rotate " + orientation + " | ";
                        }
                        else self.logger.warn("INVALID RESOLUTION SET FOR " + display.port);
                    }
                    callback(null);
                }, function (err) {
                    if (err) return self.logger.error("configureDisplay returned error:\n" + err);
                    self.childProcess(command.substring(0, command.length - 2), function (resp) { callback(null) });
                });
            }
            else callback(null)
        });
    }

    disableMonitorSleep(callback) {
        var self = this;
        self.logger.trace("entering disableMonitorSleep")
        var d = dnode.connect(50004).on('error', function (error) {
            self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
        });
        d.on('remote', function (remote) {
            remote.disableSleep(function (s) {
                self.logger.info("monitor sleep disabled");
                d.end();
                callback(null);
            });
        });
    }

    setSleepSchedule(callback) {
        var self = this;
        self.logger.trace('entering setSleepSchedule');
        var d = dnode.connect(50004).on('error', function (error) {
            self.logger.error('Attempt to connect to RootProcesses failed with error: ', error)
        });
        if (!self.config.sleepDays) self.config.sleepDays = [0, 1, 2, 3, 4, 5, 6]
        d.on('remote', function (remote) {
            remote.setSleepSchedule(self.config.wakeupTime, self.config.sleepTime, self.config.sleepDays, function (s) {
                self.logger.info("sleep schedule set");
                d.end();
                callback(null);
            });
        });
    }

    getMacAddress(callback) {
        var self = this;
        self.logger.trace('entering getMacAddress');
        self.childProcess("ifconfig | grep HWaddr | awk 'NF>1{print $1 \" \" $NF}'", function (resp) {
            self.config.macAddress = [];
            for (var i = 0, macs = resp.split('\n'); i < macs.length - 1; i++) {
                var mac = macs[i].split(' ');
                self.config.macAddress.push({ interface: mac[0], address: mac[1] });
            }
            callback(null);
        });
    }

    setPlayerName() {
        var self = this;
        self.logger.trace('entering setPlayerName');
        self.childProcess('hostnamectl set-hostname ' + self.config.player_name, function (hostname) { });
    }

    getVolume(callback) {
        var self = this;
        self.logger.trace('entering getVolume');
        if (!self.config.volume) {
            self.childProcess("amixer sget Master | grep '%' | awk '{ print$4 }'", function (resp) {
                self.config.volume = resp.substring(1, resp.length - 3);
                callback(null)
            });
        }
        else callback(null)
    }

    setVolume(callback) {
        var self = this;
        self.logger.trace('entering setVolume');
        if (self.config.volume)
            self.childProcess('amixer -D pulse sset Master ' + self.config.volume + '%', function (resp) { callback(null) });
        else callback(null)
    }

    setDiskSpace(callback) {
        var self = this;
        self.logger.trace('entering setDiskSpace');
        self.childProcess('df -h --total | grep \'total\' | awk \'{ print $4 }\'', function (resp) { self.config.diskSpace = resp.trim(); callback(null); });
    }

    setAvailableMemory(callback) {
        var self = this;
        self.logger.trace('entering setAvailableMemory');
        self.childProcess('free -m | grep \'Mem:\' | awk \'{ print $7 }\'', function (resp) { self.config.availableMemory = resp.trim(); callback(null); });
    }

    setCPUUsage(callback) {
        var self = this;
        self.logger.trace('entering setCPUUsage');
        self.childProcess('grep \'cpu \' /proc/stat | awk \'{usage=($2+$4)*100/($2+$4+$5)} END {print usage}\'', function (resp) { self.config.cpuUsage = resp.trim(); callback(null); });
    }

    setOSVersion(callback) {
        var self = this;
        self.logger.trace('entering setOSVersion');
        self.childProcess('lsb_release -a | grep \'Description:\' | awk \'{$1=\"\"; print $0}\'', function (resp) { self.config.osVersion = resp.trim(); callback(null); });
    }

    setGraphicsCard(callback) {
        var self = this;
        self.logger.trace('entering setGraphicsCard');
        self.childProcess('lspci  -v -s  $(lspci | grep VGA | cut -d" " -f 1)', function (resp) {
            self.config.graphicsCard = resp.substring(resp.indexOf(":", 5) + 1, resp.indexOf("\n")).trim(); callback(null);
        });
    }

    parseEDID(displayPorts, callBack) {
        var self = this;
        self.logger.trace('entering parseEDID');
        var child = exec('ls /sys/class/drm/*/edid | xargs -i{} sh -c "echo {}; parse-edid < {}"', { shell: '/bin/bash' }, function (error, stdout, stderr) {
            var modelNames = stdout.match(/ModelName\s\"(.*)\"/g);
            var modelNamesCB = [];
            async.each(modelNames, function (modelName, callback) {
                if (modelName)
                    modelNamesCB.push(modelName.substring(modelName.indexOf('"') + 1, modelName.length - 1));
                callback(null);
            }, function (err) {
                if (err) return self.logger.error("parseEDID returned error: " + err);
                callBack(modelNamesCB);
            });
        });
    }

    getAudioSinks(callback) {
        var self = this;
        self.logger.trace('entering getAudioSinks');
        self.config.soundSinks = []
        self.childProcess('pacmd list-sinks | fgrep "alsa.name"', function (resp) {
            var names = resp.split('\n');
            self.childProcess('pacmd list-sinks | fgrep "index"', function (resp) {
                var sinks = resp.split('\n');
                for (var i = 0; i < names.length; i++) {
                    if (sinks[i].match(/\d+/)) {
                        var index = sinks[i].match(/\d+/)[0]
                        if (sinks[i].indexOf('*') > -1 && !self.config.soundOutput) self.config.soundOutput = index
                        self.config.soundSinks.push({
                            name: names[i].replace('alsa.name = ', '').replace(/['"]+/g, '').replace(/\t/g,''),
                            index: index
                        })
                    }
                }
                callback(null);
            });
        });
    }

    setAudioSink(callback) {
        var self = this;
        self.logger.trace('entering setAudioSink');
        if (self.config.soundOutput) {
            self.childProcess('pacmd set-default-sink ' + self.config.soundOutput, function (resp) {
                self.logger.info("sound output set to sink " + self.config.soundOutput);
                callback(null);
            });
        }
    }

    getEDID(displayPorts, callback) {
        var self = this;
        self.logger.trace('entering getEDID');
        var child = exec("dpkg -l read-edid", { shell: '/bin/bash' }, function (error, stdout, stderr) {
            if (!error) self.parseEDID(displayPorts, function (modelNames) { callback && callback(modelNames) });
            else {
                self.logger.warn('read-edid is not installed! Installing read-edid');
                self.childProcess('apt-get install read-edid', function (resp) {
                    self.parseEDID(displayPorts, function (modelNames) { callback && callback(modelNames) });
                });
            }
        });
    }

    setDisplayInfos(callback) {
        var self = this;
        self.logger.trace('entering setDisplayInfos');
        self.childProcess('xrandr | grep \'\\sconnected\\s\' | awk \'{ print$1 }\'', function (resp) {
            var displayInfos = [];
            var displayPorts = resp.trim().split('\n');
            self.getEDID(displayPorts, function (ModelNames) {
                self.childProcess('xrandr | awk \'{ print$1 }\'', function (response) {
                    async.each(displayPorts, function (displayPort, callback) {
                        var index = displayPorts.indexOf(displayPort);
                        self.getResolutions(displayPort, response, function (resolutions) {
                            displayInfos.push({ port: displayPort, resolutions: resolutions, model_name: (ModelNames[index] ? ModelNames[index] : "") });
                        });
                        if (self.config.displays && index < self.config.displays.length) self.config.displays[index].port = displayPorts[index];
                        callback(null);
                    }, function (err) {
                        if (err) return self.logger.error("setDisplayInfos returned error:\n" + err);
                        self.config.displayInfos = displayInfos;
                        callback(null);
                    });
                });
            });
        });
    }

    getResolutions(displayPort, resp, callBack) {
        var self = this;
        self.logger.trace('entering getResolutions');
        var respArray = [];
        var i = (respArray = resp.trim().split('\n')).indexOf(displayPort) + 1;
        var start = i;
        while (respArray[i] && respArray[i].match(/[0-9]+x[0-9]+.*/)) i++;
        callBack(respArray.slice(start, i));
    }

    getCurrentConnection(callBack) {
        var self = this;
        self.logger.trace('entering getCurrentConnection');
        self.childProcess('nmcli dev wifi list | grep \\*', function (resp) {
            var parsedResp = resp.split('\n');
            if (parsedResp && parsedResp.length > 1) callBack(parsedResp[1].split(/[ ,]+/)[1]);
            else callBack(null);
        });
    }

    getWifiList(callBack) {
        var self = this;
        self.logger.trace('entering getWifiList');
        self.childProcess('nmcli dev wifi list', function (resp) {
            var wifiList = [];
            var wifiArray = resp.split('\n');
            if (wifiArray[0]) {
                var ssidLength = wifiArray[0].match(/.*SSID(\s*)/) ? wifiArray[0].match(/.*SSID(\s*)/)[0].length : "";
                var modeLength = wifiArray[0].match(/.*MODE(\s*)/) ? wifiArray[0].match(/.*MODE(\s*)/)[0].length : "";
                var chanLength = wifiArray[0].match(/.*CHAN(\s*)/)[0] ? wifiArray[0].match(/.*CHAN(\s*)/)[0].length : "";
                var rateLength = wifiArray[0].match(/.*RATE(\s*)/)[0] ? wifiArray[0].match(/.*RATE(\s*)/)[0].length : "";
                var signalLength = wifiArray[0].match(/.*SIGNAL(\s*)/)[0] ? wifiArray[0].match(/.*SIGNAL(\s*)/)[0].length : "";
                var barsLength = wifiArray[0].match(/.*BARS(\s*)/)[0] ? wifiArray[0].match(/.*BARS(\s*)/)[0].length : "";
                var securityLength = wifiArray[0].match(/.*SECURITY(\s*)/)[0] ? wifiArray[0].match(/.*SECURITY(\s*)/)[0].length : "";
                for (var i = 1; i < wifiArray.length && i < 15; i++) {
                    wifiList.push({
                        ssid: wifiArray[i].substring(0, ssidLength),
                        mode: wifiArray[i].substring(ssidLength, modeLength),
                        chan: wifiArray[i].substring(modeLength, chanLength),
                        rate: wifiArray[i].substring(chanLength, rateLength),
                        signal: wifiArray[i].substring(rateLength, signalLength),
                        bars: wifiArray[i].substring(signalLength, barsLength),
                        security: wifiArray[i].substring(barsLength, securityLength)
                    });
                }
                callBack(wifiList);
            }
        });
    }
}

exports.Tasks = Tasks;