/*
InViewBuilder - Generates the player query, does the query and generates the player instuctions JSON.
Author: Eric Meyer
*/

const DCTag = "KorbytDefaultContent".toUpperCase();

export class InViewBuilder {
    tenant: number;
    db: any;
    handler: (err, result) => void;
    inview: any;
    playlists: any[];
    plmap: any;
    pIndex: number;
    iid: number;

    constructor() {
        this.tenant = 1; // default
        this.db = null;
        this.inview = {};
        this.playlists = [];
        this.plmap = {};
        this.handler = null;
        this.pIndex = 0;
    }

    // Helper method ... cleanup obj properties
    sweep(obj: any): any {
        var result: any = {};
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

    // Build the player instructions
    build(tenant: number, iid: number, db: any, handler: (err, result) => void) {
        var self = this;
        self.tenant = tenant;
        self.db = db;
        self.handler = handler;
        self.iid = iid;
        self.getInview(iid);
    }

    // Get the player
    getInview(id: number): void {
        var self = this;
        self.db.query("SELECT inview_user_id AS id, email, updated_date AS lastupdate FROM inview_users_r WHERE inview_user_id = $1", [id], function (err: any, results: any) {
            if (err) {
                self.handler(err, { 'error': err });
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                self.inview = self.sweep(results.rows[0]);
                self.playlists = [];
                self.inview.playlists = self.playlists; // Make sure player has a reference
                self.getInviewCampaigns();
            }
            else {
                self.handler("inview does not exist", {});
            }
        });
    }


    // Get the Campaigns assigned to a Inview user group
    getInviewCampaigns() {
        var self = this;
        var query = "SELECT ic.inview_campaign_id AS id, ic.campaign_name AS name, ic.description, ic.duration_per_content AS defaultruntime, ic.expired_at AS expires, ";
        query += "ic.created_at AS lastupdate ";
        query += "FROM inview_campaign_r ic INNER JOIN inview_campaign_groups_r icg ON icg.inview_campaign_id = ic.inview_campaign_id ";
        query += "INNER JOIN inview_users_groups_r ig ON icg.inview_usergroup_id = ig.inview_usergroup_id WHERE ig.inview_user_id = $1;";

        self.db.query(query, [self.inview.id], function (err: any, results: any) {
            if (err) {
                self.handler(err, {});
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                for (var p = 0; p < results.rows.length; p++) {
                    var playlist = results.rows[p];
                    if (self.plmap[playlist.id] == undefined) {
                        self.playlists.push(self.sweep(playlist));
                        self.plmap[playlist.id] = true;
                    }
                }
            }

            self.getDefaultCampaigns();
        });
    }

    getDefaultCampaigns() {
        var self = this;
        var query = "SELECT ic.inview_campaign_id AS id, ic.campaign_name AS name, ic.description, ic.duration_per_content AS defaultruntime, ic.expired_at AS expires, ";
        query += "ic.created_at AS lastupdate FROM inview_campaign_r ic ";
        query += "INNER JOIN tags_r ON (upper(tag) = $1) and (content_type_id = 15) where owner_id = ic.inview_campaign_id;";

        self.db.query(query, [DCTag], function (err: any, results: any) {
            if (err) {
                self.handler(err, {});
                return;
            }
            if (results && results.rows && (results.rows.length > 0)) {
                for (var p = 0; p < results.rows.length; p++) {
                    var playlist = results.rows[p];
                    playlist.default_content = true;
                    if (self.plmap[playlist.id] == undefined) {
                        self.playlists.push(self.sweep(playlist));
                        self.plmap[playlist.id] = true;
                    }
                }
            }

            if (self.playlists.length == 0)
                self.handler(null, self.inview);
            else
                self.getSchedule();
        });
    }

    // Get the playlist schedule
    getSchedule() {
        var self = this;
        var playlist = self.playlists[self.pIndex];
        var playtimes = [];
        playlist.playtimes = playtimes;

        var query = "SELECT inview_campaign_schedule_id AS id,  schedule_type AS playalways, start_date, end_date, time_day_selection AS timedays, start_time, end_time, repeated_days AS weekdays ";
        query = query + "FROM inview_campaign_schedule_r WHERE inview_campaign_id = $1;";

        //console.info('Playlist.id: ' + playlist.id);

        self.db.query(query, [playlist.id], function (err: any, results: any) {
            if (err) {
                self.handler(err, self.inview);
            } else {
                if (results && results.rows && (results.rows.length > 0)) {

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
                        } else if (!playtime.timedays) {
                            playtime.start_time = null;
                            playtime.end_time = null;
                            playtime.weekdays = null;
                        }
                        playtimes.push(self.sweep(playtime));
                    }
                }
                self.getMessageItems();
            }
        });
    }

    fixUrl(url: string): string {
        return ('/' + url).replace(/\/\//g, '/');
    }

    // Get the playlist content 
    getMessageItems() {
        var self = this;
        var playlist = self.playlists[self.pIndex];
        var items = [];
        playlist.items = items;

        var query;

        query = "SELECT message.inview_message_id AS id, message.name, message.url AS uri, message.updated_date as lastupdate, type, order_no AS seq FROM inview_campaign_message_r campaign ";
        query += "INNER JOIN inview_message_r message on campaign.type = 8 AND campaign.inview_message_id = message.inview_message_id WHERE campaign.inview_campaign_id = $1 AND ";
        query += "(COALESCE(start_date,'1970-01-01') <= current_date) AND (COALESCE(expired_date,'9999-12-31') >= current_date);";

        self.db.query(query, [playlist.id], function (err: any, results: any) {
            if (err) {
                self.handler(err, self.inview);
            } else {
                if (results && results.rows && (results.rows.length > 0)) {

                    for (var i = 0; i < results.rows.length; i++) {
                        var t = results.rows[i];
                        var item: any = {};
                        item.id = t.id;
                        item.name = t.name;
                        item.seq = t.seq;
                        item.uri = self.fixUrl(t.uri);
                        item.type = t.type;
                        item.lastupdate = t.lastupdate;
                        items.push(self.sweep(item));
                    }
                }
                self.getSurveyItems();
            }
        });
    }

    // Get the playlist content 
    getSurveyItems() {
        //console.info('getSurveyItems');
        var self = this;
        var playlist = self.playlists[self.pIndex];
        var items = playlist.items;

        var query;

        query = "SELECT survey.inview_survey_id AS id, survey.name, type, order_no AS seq FROM inview_campaign_message_r campaign ";
        query += "INNER JOIN inview_survey_r survey on campaign.type = 10 AND campaign.inview_message_id = survey.inview_survey_id WHERE (campaign.inview_campaign_id = $1) ";
        query += "AND ((current_date >= start_date) AND (current_date <= end_date)) "
        query += "AND survey.inview_survey_id NOT IN (SELECT inview_survey_id FROM inview_survey_data_r WHERE author_id = $2);"

        self.db.query(query, [playlist.id, self.iid], function (err: any, results: any) {
            if (err) {
                self.handler(err, self.inview);
            } else {
                if (results && results.rows && (results.rows.length > 0)) {

                    for (var i = 0; i < results.rows.length; i++) {
                        var t = results.rows[i];
                        var item: any = {};
                        item.id = t.id;
                        item.name = t.name;
                        item.seq = t.seq;
                        if (t.uri) {
                            item.uri = self.fixUrl(t.uri);
                        } else {
                            item.uri = `/survey/data/${t.id}/open`;
                        }
                        item.type = t.type;
                        items.push(self.sweep(item));
                    }
                }
                self.getQuizItems();
            }
        });
    }


    getQuizItems() {
        //console.info('getQuizItems');
        var self = this;
        var playlist = self.playlists[self.pIndex];
        var items = playlist.items;

        var query;

        query = "SELECT quiz.inview_quiz_id AS id, quiz.name, type, order_no AS seq FROM inview_campaign_message_r campaign ";
        query += "INNER JOIN inview_quiz_r quiz on campaign.type = 9 AND campaign.inview_message_id = quiz.inview_quiz_id WHERE (campaign.inview_campaign_id = $1) ";
        query += "AND ((start_date <= current_date) AND (current_date <= end_date)) "
        query += "AND quiz.inview_quiz_id NOT IN (SELECT inview_quiz_id FROM inview_quiz_exam_r WHERE author_id = $2);"

        self.db.query(query, [playlist.id, self.iid], function (err: any, results: any) {
            if (err) {
                self.handler(err, self.inview);
            } else {
                if (results && results.rows && (results.rows.length > 0)) {

                    for (var i = 0; i < results.rows.length; i++) {
                        var t = results.rows[i];
                        var item: any = {};
                        item.id = t.id;
                        item.name = t.name;
                        item.seq = t.seq;
                        if (t.uri) {
                            item.uri = self.fixUrl(t.uri);
                        } else {
                            item.uri = `/quiz/exam/${t.id}/open`;
                        }
                        item.type = t.type;
                        items.push(self.sweep(item));
                    }
                }
                items.sort(function (a, b) {
                    return a.seq - b.seq;
                });
                self.nextPlaylist();
            }
        });
    }

    nextPlaylist() {
        var self = this;
        self.pIndex++;
        if (self.pIndex < self.playlists.length) {
            self.getSchedule();
        } else {
            self.handler(null, self.inview);
        }
    }
}
