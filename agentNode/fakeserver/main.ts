import * as express from "express";


import * as fs from "fs";


const app = express();

const env = JSON.parse(fs.readFileSync("./env.json", "utf8"));

var playlist = [
    "page1.html",
    "page2.html",
    "Short Big Buck Bunny Clip.mp4",
    "a01.jpg",
    "a02.jpg",
    "a03.jpg",
    "a04.jpg",
    "a05.jpg",
    "page1.html",
    "page2.html",
    "Short Big Buck Bunny Clip.mp4",
    "a06.jpg",
    "a07.jpg",
    "a08.jpg",
    "a09.jpg",
    "a10.jpg",
];

var animations = [
    "Fade In",
    "Fade In Down",
    "Fade In Down Big",
    "Fade In Left",
    "Fade In Left Big",
    "Fade In Right",
    "Fade In Right Big",
    "Fade In Up",
    "Fade In Up Big",
    "Light Speed In",
    "Rotate In",
    "Rotate In Down Left",
    "Rotate In Down Right",
    "Rotate In Up Left",
    "Rotate In Up Right",
    "Slide In Up",
    "Slide In Down",
    "Slide In Left",
    "Slide In Right",
    "Zoom In",
    "Zoom In Down",
    "Zoom In Left",
    "Zoom In Right",
    "Zoom In Up",
    "Roll In"
];

var counter = 0;

app.listen(env.webPort);

app.get("/checkin", checkin);
app.get("/heartbeat", heartbeat);

function checkin(req, res, next) {
    try {
        var incoming = req.query.pl;
        var pID = parseInt(incoming);
        var player = generateTestInstructions();
        player.playerID = pID;

        res.send(player);
    }
    catch (error) {
        res.status(500).send({ "status": 500, "error": error });
    }
}

function heartbeat(req, res, next) {
     try {
         var hb: any = {};

         hb.servertime =(new Date()).toUTCString()

         hb.actions = [];

         switch(Math.floor(Math.random() * 10)) {
             case 0: hb.actions.push('checkin'); break;
             case 1: hb.actions.push('screenshot'); break;
             case 2: hb.actions.push('configuration'); break;
             case 3: hb.actions.push('playerlog'); break;
         }

        res.send(hb);
    }
    catch (error) {
        res.status(500).send({ "status": 500, "error": error });
    }
}

function generateTestInstructions(): any {
    var pIns: any = {};
    pIns.playerID = 96;
    pIns.player_name = "test player";
    pIns.playlists = [];
    
    pIns.playlists.push(generatePlaylist({
        "playalways": false,
        "start_date": "2017-01-01T06:00:00.000Z",
        "end_date": "2017-12-31T06:00:00.000Z",
        "timedays": true,
        "start_time": "00:00:00",
        "end_time": "00:00:00",
        "weekdays": "12345"
    }));

    pIns.playlists.push(generatePlaylist({
        "playalways": false,
        "start_date": "2017-01-01T06:00:00.000Z",
        "end_date": "2017-12-31T06:00:00.000Z",
        "timedays": true,
        "start_time": "00:00:00",
        "end_time": "00:00:00",
        "weekdays": "06"
    }));

    return pIns;
}

function generatePlaylist(schedule: any) {

var pl: any = {};

    pl.defaultruntime = 10;
    pl.defaultanimation = animations[Math.floor(Math.random() * animations.length)]; // Random
    pl.playfull = true;
    pl.itemsper = 3;
    pl.dynamic = false;
    pl.playtimes = [];
    pl.playtimes.push(schedule);

    pl.items = [];

    for (var i = 0; i < playlist.length; i++) {
        var item: any = {};
        item.uri = playlist[i];

        if (item.uri.toLowerCase().endsWith('.html')) {
            item.type = 0; // layout
        } else if (item.uri.toLowerCase().endsWith('.mp4')) {
            item.type = 2; // video
            item.runtime = 5; // override the runtime
        } else {
            item.type = 1; // graphic
        }

        item.animation = animations[Math.floor(Math.random() * animations.length)]; // Random
        pl.items.push(item);
    }
        return pl;
}