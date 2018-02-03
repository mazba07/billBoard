/*
 * @Author: Stephen Kuehl 
 * @Date: 2017-01-10 14:28:12 
 * @Last Modified by: Stephen Kuehl
 * @Last Modified time: 2017-01-12 10:11:02
 */

const chai = require('chai');
var app = require('../app.js');
var request = require("request");
var httpUtils = require('request-mocha')(request);

var assert = chai.assert;
var expect = chai.expect;

describe('Playlist Information', function () {
    httpUtils.save('http://172.25.1.19:8085/checkin?pl=98');

    it('should have a player ID object', function () {
        var info = JSON.parse(this.body);
        expect(info).to.have.property("playerID");
    });

    it('should have a player ID that is an integer', function () {
        var info = JSON.parse(this.body);

        // Chai does not have a way to test for integers
        expect(info.playerID).to.be.a('Number');
        expect(info.playerID % 1).to.be.equal(0);
    });

    it('should have a player ID greater than zero', function () {
        var info = JSON.parse(this.body);
        expect(info.playerID).to.be.above(0);
    });

    it('should have a player ID that is equal to 98', function () {
        var info = JSON.parse(this.body);
        expect(info.playerID).to.equal(98);
    });

    it('should have a player name', function () {
        var info = JSON.parse(this.body);
        expect(info).to.have.property("player_name");
    });

    it('should have a player name that is equal to "Stephens [DO NOT TOUCH]"', function () {
        var info = JSON.parse(this.body);
        expect(info.player_name).to.equal("Stephens [DO NOT TOUCH]");
    });

    it('should have a playlists object', function () {
        var info = JSON.parse(this.body);
        expect(info).to.have.property("playlists");
    });

    it('should not have an empty playlist', function () {
        var info = JSON.parse(this.body);
        expect(info.playlists).to.not.be.empty;
    });

    it('should have at most 4 playlists', function () {
        var info = JSON.parse(this.body);

        // Chai does not have array exactly equal to api
        expect(info.playlists).to.have.length.of.at.most(4);
    });

    it('should have at most 4 playlists ID', function () {
        var info = JSON.parse(this.body);

        var playlistIDs = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistIDs.push(info.playlists[i].id) }

        expect(playlistIDs).to.have.length.of.at.most(4);
    });

    it('should have 4 playlists ID of [5, 29, 20, 42]', function () {
        var info = JSON.parse(this.body);

        var playlistIDs = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistIDs.push(info.playlists[i].id) }

        expect(playlistIDs[0]).to.equal(5);
        expect(playlistIDs[1]).to.equal(29);
        expect(playlistIDs[2]).to.equal(20);
        expect(playlistIDs[3]).to.equal(42);
    });

    it('should have at most 4 playlist name objects', function () {
        var info = JSON.parse(this.body);

        var playlistNames = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistNames.push(info.playlists[i].name) }

        expect(playlistNames).to.have.length.of.at.most(4);
    });

    it('should have 4 playlist names equal to [Eric M Static, 12.30.16ThamerDynamic1, ERIC M Dynamic, ERIC M 3]', function () {
        var info = JSON.parse(this.body);

        var playlistNames = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistNames.push(info.playlists[i].name) }

        expect(playlistNames[0]).to.equal("Eric M Static");
        expect(playlistNames[1]).to.equal("12.30.16ThamerDynamic1");
        expect(playlistNames[2]).to.equal("ERIC M Dynamic");
        expect(playlistNames[3]).to.equal("ERIC M 3");
    });

    it('should have at most 4 playlist default runtime objects', function () {
        var info = JSON.parse(this.body);

        var playlistDefaultRuntime = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistDefaultRuntime.push(info.playlists[i].defaultruntime) }

        expect(playlistDefaultRuntime).to.have.length.of.at.most(4);
    });

    it('should have a default runtimes that are integers', function () {
        var info = JSON.parse(this.body);

        var playlistDefaultRuntime = [];
        for (var i = 0; i < info.playlists.length; i++) {
            playlistDefaultRuntime.push(info.playlists[i].defaultruntime);

            // Chai does not have a way to test for integers
            expect(playlistDefaultRuntime[i]).to.be.a('Number');
            expect(playlistDefaultRuntime[i] % 1).to.be.equal(0);
        }
    });

    it('should have 4 playlist default runtimes equal to [20, 40, 15, 20]', function () {
        var info = JSON.parse(this.body);

        var playlistDefaultRuntime = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistDefaultRuntime.push(info.playlists[i].defaultruntime) }

        expect(playlistDefaultRuntime[0]).to.equal(20);
        expect(playlistDefaultRuntime[1]).to.equal(40);
        expect(playlistDefaultRuntime[2]).to.equal(15);
        expect(playlistDefaultRuntime[3]).to.equal(20);
    });

    it('should have at most 4 playlist default animation objects', function () {
        var info = JSON.parse(this.body);

        var playlistDefaultAnimation = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistDefaultAnimation.push(info.playlists[i].defaultanimation) }

        expect(playlistDefaultAnimation).to.have.length.of.at.most(4);
    });

    it('should have default animations that are strings', function () {
        var info = JSON.parse(this.body);

        var playlistDefaultAnimation = [];
        for (var i = 0; i < info.playlists.length; i++) {
            playlistDefaultAnimation.push(info.playlists[i].defaultanimation);

            // Chai does not have a way to test for integers
            expect(playlistDefaultAnimation[i]).to.be.a('String');
        }
    });

    it('should have 4 playlist default animations equal to ["Slide In Down", "Slide In Up", "Fade In Up Big", "Fade In Right Big"]', function () {
        var info = JSON.parse(this.body);

        var playlistDefaultAnimation = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistDefaultAnimation.push(info.playlists[i].defaultanimation) }

        expect(playlistDefaultAnimation[0]).to.equal("Slide In Down");
        expect(playlistDefaultAnimation[1]).to.equal("Slide In Up");
        expect(playlistDefaultAnimation[2]).to.equal("Fade In Up Big");
        expect(playlistDefaultAnimation[3]).to.equal("Fade In Right Big");
    });

    it('should have at most 4 play full objects', function () {
        var info = JSON.parse(this.body);

        var playlistPlayFull = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistPlayFull.push(info.playlists[i].playfull) }

        expect(playlistPlayFull).to.have.length.of.at.most(4);
    });

    it('should have 4 play full booleans equal to [true, false, true, true]', function () {
        var info = JSON.parse(this.body);

        var playlistPlayFull = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistPlayFull.push(info.playlists[i].playfull) }

        expect(playlistPlayFull[0]).to.be.true;
        expect(playlistPlayFull[1]).to.be.false;
        expect(playlistPlayFull[2]).to.be.true;
        expect(playlistPlayFull[3]).to.be.true;
    });

    it('should have at most 4 items per objects', function () {
        var info = JSON.parse(this.body);

        var playlistItemsPer = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistItemsPer.push(info.playlists[i].itemsper) }

        expect(playlistItemsPer).to.have.length.of.at.most(4);
    });

    it('should have items per listed as integers', function () {
        var info = JSON.parse(this.body);

        var playlistItemsPer = [];
        for (var i = 0; i < info.playlists.length; i++) {
            playlistItemsPer.push(info.playlists[i].itemsper)

            // Chai does not have a way to test for integers
            expect(playlistItemsPer[i]).to.be.a('Number');
            expect(playlistItemsPer[i] % 1).to.be.equal(0);
        }
    });

    it('should have 4 items per objects equal to [3, 4, 0, 0]', function () {
        var info = JSON.parse(this.body);

        var playlistItemsPer = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistItemsPer.push(info.playlists[i].itemsper) }

        expect(playlistItemsPer[0]).to.equal(3);
        expect(playlistItemsPer[1]).to.equal(4);
        expect(playlistItemsPer[2]).to.equal(0);
        expect(playlistItemsPer[3]).to.equal(0);
    });

    it('should have at most 4 dynamic objects', function () {
        var info = JSON.parse(this.body);

        var playlistDynamic = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistDynamic.push(info.playlists[i].dynamic) }

        expect(playlistDynamic).to.have.length.of.at.most(4);
    });

    it('should have 4 dynamic booleans equal to [false, true, true, false]', function () {
        var info = JSON.parse(this.body);

        var playlistDynamic = [];
        for (var i = 0; i < info.playlists.length; i++) { playlistDynamic.push(info.playlists[i].dynamic) }

        expect(playlistDynamic[0]).to.be.false;
        expect(playlistDynamic[1]).to.be.true;
        expect(playlistDynamic[2]).to.be.true;
        expect(playlistDynamic[3]).to.be.false;
    });

    it('should have the play times property', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimes = [];
        for (var i = 0; i < info.playlists.length; i++) {
            playlistPlayTimes.push(info.playlists[i].playtimes)
            expect(info.playlists[i]).to.have.property("playtimes");
        }
    });

    it('should not have empty play times', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimes = [];
        for (var i = 0; i < info.playlists.length; i++) {
            playlistPlayTimes.push(info.playlists[i].playtimes)
            expect(playlistPlayTimes).to.not.be.empty;
        }
    });

    it('should have at most 6 play time objects', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimes = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) { playlistPlayTimes.push(info.playlists[i].playtimes[j]); }
        }

        // Chai does not have array exactly equal to api
        expect(playlistPlayTimes).to.have.length.of.at.most(6);
    });

    it('should have the playlist, play times, id object', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesID = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesID.push(info.playlists[i].playtimes[j]);
                expect(playlistPlayTimesID[j]).to.have.property("id");
            }
        }
    });

    it('should not contain empty playlist, play times, id objects', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesID = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesID.push(info.playlists[i].playtimes[j].id);
                expect(playlistPlayTimesID[j]).to.not.be.empty;
            }
        }
    });

    it('should have at most 6 playlist, play time, id objects', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesID = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesID.push(info.playlists[i].playtimes[j].id);
            }
        }

        // Chai does not have array exactly equal to api
        expect(playlistPlayTimesID).to.have.length.of.at.most(6);
    });

    it('should have 6 playlist, play time, id objects equal to [26, 28, 29, 55, 34, 68]', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesID = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesID.push(info.playlists[i].playtimes[j].id);
            }
        }

        expect(playlistPlayTimesID[0]).to.equal(26);
        expect(playlistPlayTimesID[1]).to.equal(28);
        expect(playlistPlayTimesID[2]).to.equal(29);
        expect(playlistPlayTimesID[3]).to.equal(55);
        expect(playlistPlayTimesID[4]).to.equal(34);
        expect(playlistPlayTimesID[5]).to.equal(68);
    });

    it('should have the playlist, play time, play always object', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesPlayAlways = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesPlayAlways.push(info.playlists[i].playtimes[j]);
                expect(playlistPlayTimesPlayAlways[j]).to.have.property("playalways");
            }
        }
    });

    it('should have at most 6 playlist, play time, playalways objects', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesPlayAlways = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesPlayAlways.push(info.playlists[i].playtimes[j].playalways);
            }
        }

        // Chai does not have array exactly equal to api
        expect(playlistPlayTimesPlayAlways).to.have.length.of.at.most(6);
    });

    it('should have 6 playlist, play time, playalways objects equal to [false, true, false, true, true, true]', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesPlayAlways = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesPlayAlways.push(info.playlists[i].playtimes[j].playalways);
            }
        }

        expect(playlistPlayTimesPlayAlways[0]).to.be.false;
        expect(playlistPlayTimesPlayAlways[1]).to.be.true;
        expect(playlistPlayTimesPlayAlways[2]).to.be.false;
        expect(playlistPlayTimesPlayAlways[3]).to.be.true;
        expect(playlistPlayTimesPlayAlways[4]).to.be.true;
        expect(playlistPlayTimesPlayAlways[5]).to.be.true;
    });

    it('should have the playlist, play time, start date object', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesStartDate = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) {
                playlistPlayTimesStartDate.push(info.playlists[i].playtimes[j]);
                expect(playlistPlayTimesStartDate[j]).to.have.property("start_date");
            }
        }
    });

    it('should have at most 6 playlist, play time, start date objects', function () {
        var info = JSON.parse(this.body);

        var playlistPlayTimesStartDate = [];
        for (var i = 0; i < info.playlists.length; i++) {
            for (var j = 0; j < info.playlists[i].playtimes.length; j++) { playlistPlayTimesStartDate.push(info.playlists[i].playtimes[j].start_date); }
        }

        // Chai does not have array exactly equal to api
        expect(playlistPlayTimesStartDate).to.have.length.of.at.most(6);
    });

    it('should have at most 6 playlist, play time, start date objects equal to [..] ', function () {
    });

    it('playlist-playtimes-end_date');
    it('playlist-playtimes-timedays');
    it('playlist-playtimes-start_time');
    it('playlist-playtimes-end_time');
    it('playlist-playtimes-weekdays');
    it('playlist-items-id');
    it('playlist-items-uri');
    it('playlist-items-type');
    it('playlist-items-animation');
});