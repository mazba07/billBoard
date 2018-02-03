"use strict";
const nools = require("nools");
const log4js = require('log4js');

class RulesEngine {

    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.flowObjects = {
            DiskSpace: function (value, units) {
                this.value = value;
                this.units = units;
            },
            Config: function (config) {
                this.config = config;
            }
        };

        var self = this;
        this.flow = nools.flow("Rule Book", function (flow) {
            self.logger.trace('entering Rule Book');
            flow.rule("DiskSpaceLow", [self.flowObjects.DiskSpace, "m", "m.value < 10 && m.units == 'G' || m.units != 'G'"], function (facts) {
                self.logger.warn("Available disk space is low | Available disk space: " + facts.m.value + facts.m.units);
            });
            flow.rule("HighCPUUsage", [self.flowObjects.Config, "m", "m.config.cpuUsage > 85"], function (facts) {
                self.logger.warn("CPU Usage is very high | CPU Usage: " + facts.m.config.cpuUsage);
            });
            /*
            flow.rule("ScreenshotMissing", [self.flowObjects.Config, "m", "!m.config.screenshot"], function (facts) {
                self.config.screenshot = { width: 400, height: 300, quality: 50 };
                self.logger.warn("No screenshot property found in config. Defaulting to: " + JSON.stringify(self.config.screenshot));
            });
            if (self.config.screenshot) {
                flow.rule("Screenshot.Width", [self.flowObjects.Config, "m", "!m.config.screenshot.width || !isNumber(m.config.screenshot.width) || m.config.screenshot.width < 1"], function (facts) {
                    self.config.screenshot.width = 400;
                    self.logger.warn("Invalid value set for screenshot width. Defaulting to: " + self.config.screenshot.width);
                });
                flow.rule("Screenshot.Height", [self.flowObjects.Config, "m", "!m.config.screenshot.height || !isNumber(m.config.screenshot.height) || m.config.screenshot.height < 1"], function (facts) {
                    self.config.screenshot.height = 300;
                    self.logger.warn("Invalid value set for screenshot height. Defaulting to: " + self.config.screenshot.height);
                });
                flow.rule("Screenshot.Quality", [self.flowObjects.Config, "m", "!m.config.screenshot.quality || !isNumber(m.config.screenshot.quality) || m.config.screenshot.quality < 1"], function (facts) {
                    self.config.screenshot.quality = 50;
                    self.logger.warn("Invalid value set for screenshot quality. Defaulting to: " + self.config.screenshot.quality);
                });
            }
            */
        });

        this.session = self.flow.getSession();
    }

    evaluateRules() {
        var self = this;
        if(self.config.diskSpace)
            self.session.assert(new self.flowObjects.DiskSpace(self.config.diskSpace.replace(/\D+/, ''), self.config.diskSpace.replace(/[^a-zA-Z]+/g, '')));
        self.session.assert(new self.flowObjects.Config(self.config));
        self.session.match(function (err) { if (err) self.logger.error("error in evaluateRules:\n" + err.stack) });
    }

}

exports.RulesEngine = RulesEngine;