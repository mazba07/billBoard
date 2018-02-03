"use strict";
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const request = require('request');
const moment = require("moment");
class Downloader {
    constructor(cacheRoot, hostUri, resources, handler) {
        this.cacheRoot = cacheRoot;
        this.hostUri = hostUri;
        this.queue = resources;
        this.handler = handler;
        this.next(this);
    }
    verifyPath(uri) {
        var parts = uri.split('/');
        var pn = this.cacheRoot;
        var max = parts.length - 1;
        for (var i = 1; i < max; i++) {
            pn = pn + '/' + parts[i];
            if (!fs.existsSync(pn)) {
                fs.mkdirSync(pn);
            }
        }
        if (uri.startsWith('/embed/')) {
            return path.join(this.cacheRoot, uri + '.html');
        }
        else {
            return path.join(this.cacheRoot, uri);
        }
    }
    next(self) {
        if (self.queue.length > 0) {
            var uri = self.queue.pop();
            var dest = self.verifyPath(uri);
            var needsDownloading = !(uri.startsWith('/ml/') && fs.existsSync(dest));
            if (needsDownloading) {
                request
                    .get(self.hostUri + uri)
                    .on('error', function (err) {
                    self.handler(err);
                })
                    .pipe(fs.createWriteStream(dest))
                    .on('finish', function () {
                    console.info(`Downloaded: ${dest}, ${self.queue.length} items remaining`);
                    self.next(self);
                });
            }
            else {
                console.info('Verified: ' + dest);
                self.next(self);
            }
        }
        else {
            self.handler(null);
        }
    }
}
class CachingProxy {
    constructor(port, cacheRoot, hostUri) {
        this.port = port;
        this.cacheRoot = cacheRoot;
        this.hostUri = hostUri;
        this.webServer = express();
        this.webServer.listen(this.port);
        this.webServer.use(express.static(cacheRoot));
        this.webServer.use(function (req, res, next) {
            // console.info(JSON.stringify(req));
            // console.info(JSON.stringify(res));
            res.setHeader('Access-Control-Allow-Origin', '*');
            next();
        });
        this.prereqs();
    }
    prereqs() {
        var self = this;
        request(self.hostUri + '/prt/manifest.json', function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var files = JSON.parse(body);
                for (var f in files) {
                    files[f] = '/prt/' + files[f];
                }
                self.enQueue(files, function (err) {
                    if (err) {
                        console.error('Unable to get lastest player time files');
                    }
                    else {
                        console.info('--- Prerequisites done ---');
                    }
                });
            }
        });
    }
    enQueue(resources, handler) {
        var downloader = new Downloader(this.cacheRoot, this.hostUri, resources, function (err) {
            handler(err);
        });
    }
    setInstructions(arg, handler) {
        var instructions = arg.instructions;
        if (instructions) {
            if (instructions.playlists) {
                var playlists = instructions.playlists;
                for (var p = 0; p < playlists.length; p++) {
                    var items = playlists[p].items;
                    if (!items) {
                        continue;
                    }
                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        if (item.type == 0) {
                            if (item.uri.startsWith('/external/')) {
                                item.uri = this.hostUri + item.uri; // These are not cached
                            }
                        }
                    }
                }
            }
            if (instructions.resources) {
                if (instructions.preload && instructions.preload_days && instructions.preload_start_time && instructions.preload_duration) {
                    // convert digit string to bits
                    var dow = 0;
                    if (instructions.preload_days) {
                        for (var i = 0; i < 7; i++) {
                            if (instructions.preload_days.indexOf("" + i) >= 0) {
                                dow = dow | (1 << i);
                            }
                        }
                    }
                    else {
                        dow = 0x7F; // All days
                    }
                    var now = moment(new Date);
                    var weekday = now.isoWeekday() == 7 ? 0 : now.isoWeekday();
                    var daybit = (1 << weekday);
                    if ((dow & daybit) == daybit) {
                        var preload = moment(now.format('YYYY-MM-DD') + ' ' + instructions.preload_start_time, 'YYYY-MM-DD HH:mm:ss');
                        if (now.isSameOrAfter(preload)) {
                            var elapsed = now.diff(preload) / (1000 * 60); // Convert to minutes elapsed
                            if (elapsed <= instructions.preload_duration) {
                                this.enQueue(instructions.resources, handler);
                            }
                        }
                    }
                }
                else {
                    this.enQueue(instructions.resources, handler);
                }
            }
            else {
                handler('Invalid instructions passed');
            }
        }
    }
}
exports.CachingProxy = CachingProxy;
