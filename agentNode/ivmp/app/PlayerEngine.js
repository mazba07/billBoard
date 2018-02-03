(function () {'use strict';

// Updated 01/12/2017
const moment = require("moment");
//import webDriver = require('selenium-webdriver');
var ContentType;
(function(ContentType) {
    ContentType[ContentType["Content"] = 0] = "Content";
    ContentType[ContentType["Playlist"] = 1] = "Playlist";
    ContentType[ContentType["Player"] = 2] = "Player";
})(ContentType || (ContentType = {}));
class Playable {
    constructor(contentType, whatami) {
        this.contentType = contentType;
        this.whatami = whatami;
        this.playing = false;
        this.lastCycle = -1;
        this.runtime = 0; // forever
    }
    onScheduleTimer(now) {
        //console.log(this.whatami + ": " + now.toISOString());
        if (this.runtime > 0) {
            var elapsed = now.diff(this.started);
            if (elapsed >= this.runtime) {
                this.stop();
            }
        }
    }
    isPlayable(now, cycle) {
        return (!this.playing) && (this.lastCycle != cycle);
    }
    start(now, cycle) {
        this.started = now;
        this.lastCycle = cycle;
        this.playing = true;
    }
    stop() {
        this.playing = false;
    }
}
class Content extends Playable {
    constructor(json, defaultanimation, defaultruntime) {
            var who = json.name || json.uri;
            super(ContentType.Content, "Content(" + who + ")");
            this.id = json.id;
            this.name = json.name;
            this.uri = json.uri;
            if (json.duration) {
                this.runtime = json.runtime * 1000;
            } else {
                this.runtime = defaultruntime * 1000;
            }
            if (json.animation) {
                // Convert the animation string into the CSS class name of the class by camel casing it.
                this.animation = this.camelize(json.animation);
            } else {
                this.animation = this.camelize(defaultanimation);
            }
        }
        // Camel case the string passed
    camelize(str) {
        return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
            if (+match === 0)
                return ""; // or if (/\s+/.test(match)) for white spaces
            return index == 0 ? match.toLowerCase() : match.toUpperCase();
        });
    }
    start(now, cycle) {
        super.start(now, cycle);
        if (PlayerEngine.callback) {
            PlayerEngine.callback(this.uri, this.animation);
        }
    }
}
class Schedule {
    constructor(json) {
        this.playalways = json.playalways;
        if (!this.playalways) {
            if (json.start_date == "0000-00-00") {
                this.start_date = moment("1970-01-01 00:00:00", "YYYY-MM-DD HH:mm:ss");
            }
            if (json.end_date == "0000-00-00") {
                this.end_date = moment("9999-12-31 23:59:59", "YYYY-MM-DD HH:mm:ss");
            }
            this.start_date = moment(json.start_date.substr(0, 10) + " 00:00:00", "YYYY-MM-DD HH:mm:ss");
            this.end_date = moment(json.end_date.substr(0, 10) + " 23:59:59", "YYYY-MM-DD HH:mm:ss");
            this.timedays = json.timedays;
            if (this.timedays) {
                this.start_time = moment(json.start_time.substr(0, 5), "HH:mm");
                this.end_time = moment(json.end_time.substr(0, 5), "HH:mm");
                if (this.start_time.isSameOrAfter(this.end_time)) {
                    this.end_time = this.end_time.add(24, "hour");
                }
                if (this.end_time.isSame(moment("00:00", "HH:mm"))) {
                    this.end_time = this.end_time.add(24, "hour");
                }
                // convert digit string to bits
                var dow = 0;
                for (var i = 0; i < 7; i++) {
                    if (json.weekdays.indexOf("" + i) >= 0) {
                        dow = dow | (1 << i);
                    }
                }
                this.daysOfWeek = dow;
            }
        }
    }
    isScheduled(now) {
        if (this.playalways) {
            return this.playalways;
        }
        if (!now.isBetween(this.start_date, this.end_date)) {
            return false;
        }
        if (this.timedays) {
            var tod = moment(now.format("HH:mm"), "HH:mm");
            if (!tod.isBetween(this.start_time, this.end_time)) {
                return false;
            }
            var weekday = now.isoWeekday() == 7 ? 0 : now.isoWeekday();
            var dow = (1 << weekday);
            if ((this.daysOfWeek & dow) != dow) {
                return false;
            }
        }
        return true;
    }
}
class PlayableList extends Playable {
    constructor(contentType, whatami) {
        super(contentType, whatami);
        this.playlist = [];
        this.cycle = 0;
        this.offset = 0;
    }
    onScheduleTimer(now) {
        //console.info("In onScheduleTimer: " + this.whatami);
        if (this.active) {
            this.active.onScheduleTimer(now);
            if (this.active.playing) {
                return;
            }
        }
        if (this.batch <= 0) {
            this.stop();
            return;
        }
        let pc = this.playlist.length;
        for (let i = 0; i < pc; i++) {
            var ci = this.playlist[i];
            if (ci.isPlayable(now, this.cycle)) {
                if (ci.contentType == ContentType.Playlist) {
                    console.info('Playlist: ' + ci.whatami);
                } else {
                    console.info('   item[' + i + ']: ' + ci.whatami);
                }
                ci.start(now, this.cycle);
                this.active = ci;
                this.batch--;
                return;
            }
        }
        this.cycle++;
    }
    start(now, cycle) {
        super.start(now, cycle);
        this.batch = ((this.itemsper <= 0) || (this.itemsper > this.playlist.length)) ? this.playlist.length : this.itemsper;
    }
}
class Playlist extends PlayableList {
    constructor(json) {
        super(ContentType.Playlist, "playlist(" + json.name + ")");
        this.id = json.id;
        this.name = json.name;
        this.description = json.name;
        this.defaultruntime = json.defaultruntime;
        this.defaultanimation = json.defaultanimation;
        this.playfull = json.playfull;
        this.itemsper = json.itemsper;
        this.playtimes = [];
        if (json.playtimes) {
            for (var i = 0; i < json.playtimes.length; i++) {
                this.playtimes.push(new Schedule(json.playtimes[i]));
            }
        }
        this.playlist = [];
        if (json.items) {
            for (var i = 0; i < json.items.length; i++) {
                this.playlist.push(new Content(json.items[i], this.defaultanimation, this.defaultruntime));
            }
        }
        this.cycle = 0;
    }
    isPlayable(now, cycle) {
        var playable = super.isPlayable(now, cycle);
        if (playable) {
            if (this.isScheduled(now)) {
                return true;
            }
        }
        return false;
    }
    isScheduled(now) {
        if (this.playtimes) {
            if (this.playtimes.length == 0) {
                return true;
            }
            for (var i = 0; i < this.playtimes.length; i++) {
                if (this.playtimes[i].isScheduled(now)) {
                    return true;
                }
            }
            return false;
        } else {
            return true;
        }
    }
}
class Player extends PlayableList {
    constructor(json) {
        super(ContentType.Player, "player");
        this.id = json.id;
        this.name = json.name;
        this.description = json.description;
        this.status = json.status;
        this.playlist = [];
        if (json.playlists) {
            for (var i = 0; i < json.playlists.length; i++) {
                this.playlist.push(new Playlist(json.playlists[i]));
            }
        }
    }
    start(now, cycle) {
        // meaningless for the player
    }
    stop() {
        // meaningless for the player
    }
}
class PlayerEngine {
    constructor(callback) {
        PlayerEngine.callback = callback;
    }
    setInstructions(instructions) {
        var newInstructions = JSON.stringify(instructions);
        if (this.oldInstructions) {
            if (this.oldInstructions != newInstructions) {
                this.player.stop();
            }
        }
        this.oldInstructions = newInstructions;
        this.player = new Player(instructions);
        this.start();
    }
    start() {
        if (this.timer) {
            return; // already running.
        }
        var self = this;
        self.timer = setInterval(() => { self.player.onScheduleTimer(moment(new Date)); }, 1000);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.timer = undefined;
    }
}
PlayerEngine.callback = null;

module.exports = PlayerEngine;

}());
//# sourceMappingURL=PlayerEngine.js.map