/*
PlayerBuilder - Generates the player query, does the query and generates the player instuctions JSON.
Author: Eric Meyer
*/
"use strict";
const DCTag = "KorbytDefaultContent".toUpperCase();
var ContentType;
(function (ContentType) {
    ContentType[ContentType["Layout"] = 0] = "Layout";
    ContentType[ContentType["Video"] = 1] = "Video";
    ContentType[ContentType["Image"] = 2] = "Image";
    ContentType[ContentType["Player"] = 3] = "Player";
    ContentType[ContentType["Playlist"] = 4] = "Playlist";
    ContentType[ContentType["WebPage"] = 5] = "WebPage";
    ContentType[ContentType["Stream"] = 6] = "Stream";
    ContentType[ContentType["Group"] = 7] = "Group";
    ContentType[ContentType["Message"] = 8] = "Message";
    ContentType[ContentType["Quiz"] = 9] = "Quiz";
    ContentType[ContentType["Survey"] = 10] = "Survey";
    ContentType[ContentType["Audience"] = 11] = "Audience";
    ContentType[ContentType["User"] = 12] = "User";
    ContentType[ContentType["Audio"] = 13] = "Audio";
    ContentType[ContentType["Text"] = 14] = "Text";
})(ContentType || (ContentType = {}));
class PlayerBuilder {
    constructor() {
        this.tenant = 1; // default tenant
        this.db = null;
        this.player = {};
        this.playlists = [];
        this.handler = null;
        this.pindex = 0;
        this.resmap = {};
    }
    resUriExists(uri) {
        return this.resmap[uri] !== undefined;
    }
    resExists(res) {
        return this.resmap[res.u] !== undefined;
    }
    resAdded(res) {
        if (this.resExists(res)) {
            return false;
        }
        this.resmap[res.u] = res;
        return true;
    }
    mkRes(u, s, v) {
        var r = {};
        r.u = u;
        if (s) {
            r.s = s;
        }
        if (v) {
            r.v = v;
        }
        return r;
    }
    // Helper method ... cleanup obj properties
    sweep(obj) {
        var result = {};
        for (var i in obj) {
            var key = i;
            var v = obj[key];
            if (v !== null) {
                if ((v !== "") && (v != "null")) {
                    switch (key) {
                        case "id":
                        case "volume":
                            if (typeof v === "string") {
                                v = parseInt(v);
                            }
                            break;
                        case "disablemouse":
                            if (typeof v === "string") {
                                v = (v.toLowerCase() == "true");
                            }
                            break;
                        case "player_id":
                            key = "playerID";
                            v = parseInt(v);
                            break;
                    }
                    result[key] = v;
                }
            }
        }
        return result;
    }
    fixUrl(url) {
        return ('/' + url).replace(/\/\//g, '/');
    }
    // Build the player instructions
    build(tenant, pid, db, handler) {
        var self = this;
        self.tenant = tenant;
        self.db = db;
        self.handler = handler;
        self.getPlayer(pid);
    }
    // Get the player
    getPlayer(pid) {
        var self = this;
        self.db.query("SELECT player_id, player_name, preload, preload_days, preload_start_time, preload_duration FROM player_r where player_id = $1", [pid], function (err, results) {
            if (err) {
                self.handler(err, {});
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                var item = results.rows[0];
                item.preload = !!item.preload; // convert to a boolean
                self.player = self.sweep(item);
                self.playlists = [];
                self.player.playlists = self.playlists; // Make sure player has a reference
                self.getPlayerPlaylists();
            }
            else {
                self.handler("player does not exist", {});
            }
        });
    }
    // Get the playlists assigned directly to the player
    getPlayerPlaylists() {
        var self = this;
        var query = "SELECT pl.playlist_id AS id, pl.playlist_name AS name, pl.description, pl.runtime AS defaultruntime, pl.default_animation AS defaultanimation, ";
        query = query + "pl.play_full_video AS playfull, pl.number_of_items AS itemsper, pl.dynamic, pl.selected_tags, pl.updated_dt ";
        query = query + "FROM playlist_r pl INNER JOIN player_playlist_r pp ON pp.playlist_id = pl.playlist_id WHERE pp.player_id = $1 ORDER BY pl.updated_dt DESC;";
        self.db.query(query, [self.player.playerID], function (err, results) {
            if (err) {
                self.handler(err, {});
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                for (var p = 0; p < results.rows.length; p++) {
                    var playlist = results.rows[p];
                    playlist.dynamic = !!playlist.dynamic; // convert to a boolean
                    playlist.playfull = !!playlist.playfull; // convert to a boolean 
                    self.playlists.push(self.sweep(playlist));
                }
            }
            self.getGroupPlaylists();
        });
    }
    // Get the playlists assigned to a player group
    getGroupPlaylists() {
        var self = this;
        var query = "SELECT pl.playlist_id AS id, pl.playlist_name AS name, pl.description, pl.runtime AS defaultruntime, pl.default_animation AS defaultanimation, ";
        query = query + "pl.play_full_video AS playfull, pl.number_of_items AS itemsper, pl.dynamic, pl.selected_tags, pl.updated_dt ";
        query = query + "FROM playlist_r pl INNER JOIN group_playlist_r gp ON gp.playlist_id = pl.playlist_id INNER JOIN player_group_r pg ON gp.group_id = pg.group_id ";
        query = query + "WHERE player_id = $1 ORDER BY pl.updated_dt DESC;";
        self.db.query(query, [self.player.playerID], function (err, results) {
            if (err) {
                self.handler(err, {});
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                for (var p = 0; p < results.rows.length; p++) {
                    var playlist = results.rows[p];
                    // Make sure it isn't a duplicate
                    var found = false;
                    for (var i = 0; i < self.playlists.length; i++) {
                        if (playlist.id == self.playlists[i].id) {
                            found = true;
                        }
                    }
                    if (!found) {
                        playlist.dynamic = !!playlist.dynamic; // convert to a boolean
                        playlist.playfull = !!playlist.playfull; // convert to a boolean 
                        self.playlists.push(self.sweep(playlist));
                    }
                }
            }
            self.getDefaultPlaylists();
        });
    }
    // Get the default content
    getDefaultPlaylists() {
        var self = this;
        var query = "SELECT pl.playlist_id AS id, pl.playlist_name AS name, pl.description, pl.runtime AS defaultruntime, pl.default_animation AS defaultanimation, ";
        query += "pl.play_full_video AS playfull, pl.number_of_items AS itemsper, pl.dynamic, pl.selected_tags, pl.updated_dt ";
        query += "FROM playlist_r pl INNER JOIN tags_r ON (upper(tag) = $1) and (content_type_id = 4) where owner_id = pl.playlist_id ORDER BY pl.updated_dt DESC;";
        self.db.query(query, [DCTag], function (err, results) {
            if (err) {
                self.handler(err, {});
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                for (var p = 0; p < results.rows.length; p++) {
                    var playlist = results.rows[p];
                    playlist.default_playlist = true;
                    // Make sure it isn't a duplicate
                    var found = false;
                    for (var i = 0; i < self.playlists.length; i++) {
                        if (playlist.id == self.playlists[i].id) {
                            found = true;
                        }
                    }
                    if (!found) {
                        playlist.dynamic = !!playlist.dynamic; // convert to a boolean
                        playlist.playfull = !!playlist.playfull; // convert to a boolean 
                        self.playlists.push(self.sweep(playlist));
                    }
                }
            }
            if (self.playlists.length == 0)
                self.handler(null, self.player);
            else
                self.getSchedule();
        });
    }
    // Get the playlist schedule
    getSchedule() {
        var self = this;
        var playlist = self.playlists[self.pindex];
        var query = "SELECT playlist_schedule_id AS id,  schedule_type AS playalways, start_date, end_date, time_day_selection AS timedays, start_time, end_time, repeated_days AS weekdays ";
        query = query + "FROM playlist_schedule_r WHERE playlist_id = $1;";
        self.db.query(query, [playlist.id], function (err, results) {
            if (err) {
                self.handler(err, self.player);
            }
            else {
                if (results && results.rows && (results.rows.length > 0)) {
                    var playtimes = [];
                    for (var i = 0; i < results.rows.length; i++) {
                        var playtime = results.rows[i];
                        playtime.playalways = !playtime.playalways; // Convert to a boolean
                        playtime.timedays = !playtime.timedays; // Convert to a inverted boolean
                        if (playtime.playalways) {
                            playtime.start_date = null;
                            playtime.end_date = null;
                            playtime.timedays = null;
                            playtime.start_time = null;
                            playtime.end_time = null;
                            playtime.weekdays = null;
                        }
                        else if (!playtime.timedays) {
                            playtime.start_time = null;
                            playtime.end_time = null;
                            playtime.weekdays = null;
                        }
                        playtimes.push(self.sweep(playtime));
                    }
                    playlist.playtimes = playtimes;
                }
                self.getLayoutItems();
            }
        });
    }
    getLayoutResources(depth, layoutList, callback) {
        //console.info(`Recursing Layouts: ${depth}, ${layoutList.length}`);
        var self = this;
        if (depth > 5) {
            callback("Layout recursion depth exceeded");
        }
        var list = layoutList.join(',');
        var layouts = []; // empty 
        self.db.query('SELECT url, type from layout_resources_r where layout_id IN (' + list + ');', [], function (err, results) {
            if (err) {
                callback(err);
            }
            else {
                if (results && results.rows && (results.rows.length > 0)) {
                    for (var i = 0; i < results.rows.length; i++) {
                        var t = results.rows[i];
                        if (t.url) {
                            if (!t.url.startsWith('http')) {
                                var res = self.mkRes(self.fixUrl(t.url));
                                if (self.resAdded(res)) {
                                    if (t.type == 'layout') {
                                        var lid = parseInt(t.url.substring(t.url.indexOf('_') + 1)); // get layout id
                                        if (layouts.indexOf(lid) < 0) {
                                            //console.info(`Adding ${lid} to layouts list`);
                                            layouts.push(lid);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (layouts.length > 0) {
                        self.getLayoutResources(depth + 1, layouts, callback);
                    }
                    else {
                        callback(null);
                    }
                }
                else {
                    callback(null); // Layout uses no external resources other than the builtin ones  
                }
            }
        });
    }
    // Get the playlist content 
    getLayoutItems() {
        var self = this;
        var playlist = self.playlists[self.pindex];
        var items = [];
        var layouts = [];
        playlist.items = items;
        //console.info('getLayoutItems');
        var query;
        if (playlist.dynamic) {
            query = "SELECT layout.layouts_id as id, layout.name, tag.tag, layout.url AS uri, layout.updated_date as lastupdate, tag.content_type_id AS type FROM layouts_r layout ";
            query += "INNER JOIN tags_r tag ON tag.content_type_id = $2 AND tag.owner_id = layout.layouts_id ";
            query += "INNER JOIN playlist_r playlist ON UPPER(tag.tag) in (select regexp_split_to_table(UPPER(playlist.selected_tags),E',') WHERE playlist.playlist_id = $1) AND ";
            query += "(COALESCE(layout.start_date,'1970-01-01') <= now()) AND (COALESCE(layout.expires_date,'9999-12-31') >= now());";
        }
        else {
            query = "SELECT layout.layouts_id AS id, layout.name, layout.url AS uri, content_type AS type, runtime, rule, animation, order_no AS seq FROM content_playlist_r playlist ";
            query += "INNER JOIN layouts_r layout on playlist.content_type = $2 AND playlist.content_id = layout.layouts_id WHERE playlist.playlist_id = $1 AND ";
            query += "(COALESCE(start_date,'1970-01-01') <= now()) AND (COALESCE(expires_date,'9999-12-31') >= now());";
        }
        self.db.query(query, [playlist.id, ContentType.Layout], function (err, results) {
            if (err) {
                self.handler(err, self.player);
            }
            else {
                if (results && results.rows && (results.rows.length > 0)) {
                    //console.info(`Found ${results.rows.length} layouts`)
                    for (var i = 0; i < results.rows.length; i++) {
                        var t = results.rows[i];
                        var item = {};
                        item.id = t.id;
                        item.name = t.name;
                        if (t.seq) {
                            item.seq = t.seq;
                        }
                        t.uri = self.fixUrl(t.uri);
                        item.uri = t.uri;
                        if (!item.uri.startsWith('/external/')) {
                            var res = self.mkRes(t.uri);
                            if (self.resAdded(res)) {
                                layouts.push(t.id); // collect unique ids
                            }
                        }
                        item.type = t.type;
                        if (t.runtime != playlist.defaultruntime) {
                            item.runtime = t.runtime;
                        }
                        item.rule = (t.rule || "").trim();
                        if (t.animation != playlist.defaultanimation) {
                            item.animation = t.animation;
                        }
                        item.lastupdate = t.lastupdate;
                        items.push(self.sweep(item));
                    }
                }
                if (layouts.length > 0) {
                    layouts.push(0);
                    self.getLayoutResources(0, layouts, function (e) {
                        if (e) {
                            self.handler(e, self.player);
                        }
                        else {
                            self.getMediaItems();
                        }
                    });
                }
                else {
                    self.getMediaItems();
                }
            }
        });
    }
    getMediaItems() {
        var self = this;
        var playlist = self.playlists[self.pindex];
        var items = playlist.items;
        var query;
        //console.info('getMediaItems');
        if (playlist.dynamic) {
            query = "SELECT media_id as id, media.post_name AS name, tag.tag, media.guid, media.post_title, tag.content_type_id AS type FROM media_r media ";
            query += "INNER JOIN tags_r tag ON tag.content_type_id IN ($2,$3) AND tag.owner_id = media.media_id ";
            query += "INNER JOIN playlist_r playlist ON tag.tag in (select regexp_split_to_table(playlist.selected_tags,E',') WHERE playlist.playlist_id = $1);";
        }
        else {
            query = "SELECT media.media_id AS id, media.post_name AS name, media.guid, media.post_title, content_type AS type, runtime, animation, order_no AS seq FROM content_playlist_r cp ";
            query += "INNER JOIN media_r media on cp.content_type IN ($2,$3) AND cp.content_id = media.media_id WHERE cp.playlist_id = $1;";
        }
        self.db.query(query, [playlist.id, ContentType.Image, ContentType.Video], function (err, results) {
            if (err) {
                self.handler(err, self.player);
            }
            else {
                if (results && results.rows && (results.rows.length > 0)) {
                    for (var i = 0; i < results.rows.length; i++) {
                        var t = results.rows[i];
                        var item = {};
                        item.id = t.id;
                        item.name = t.name;
                        item.uri = self.fixUrl('/ml/' + self.tenant + '/' + t.post_title);
                        self.resAdded(self.mkRes(item.uri));
                        item.type = t.type;
                        if (t.runtime != playlist.defaultruntime) {
                            item.runtime = t.runtime;
                        }
                        if (t.animation != playlist.defaultanimation) {
                            item.animation = t.animation;
                        }
                        item.lastupdate = t.lastupdate;
                        item.seq = t.seq;
                        items.push(self.sweep(item));
                    }
                    items.sort(function (a, b) {
                        if (a.seq && b.seq) {
                            return a.seq - b.seq;
                        }
                        return 0;
                    });
                }
                self.nextPlaylist();
            }
        });
    }
    nextPlaylist() {
        var self = this;
        self.pindex++;
        if (self.pindex < self.playlists.length) {
            self.getSchedule();
        }
        else {
            self.player.resources = [];
            for (var r in self.resmap) {
                self.player.resources.push(self.resmap[r].u);
            }
            self.handler(null, self.player);
        }
    }
}
exports.PlayerBuilder = PlayerBuilder;
//# sourceMappingURL=PlayerBuilder.js.map