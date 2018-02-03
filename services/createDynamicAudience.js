var fs = require('fs'); // Allow the use of Node filesystem APIs
var vm = require('vm'); // Allow the use of the Node Sandbox
var log4js = require('log4js').getLogger('rulesAudience'); // Require log4js
var moment = require('moment'); // Time Library


var lastGenerated = new Date(1970, 1, 1); // Never basically
var generatedCode = '';

function createDynamicAudienceCode(connection, callback) {

    // Query the database and look for all of the existing rules that need to be executed
    connection.query('SELECT r.group_id, r.disposition, f.class, f.property, r.operator, r.value, r.relationtonext, r.created_dt \
        FROM inview_rules_r R INNER JOIN inview_rules_fields_r F ON r.field = f.rules_fields_id \
        WHERE r.group_id IN (select inview_usergroup_id from inview_groups_r where dynamic = 1) \
        ORDER BY r.group_id, r.disposition;', [],
        function(err, results) {
            if (err) {
                logger.error('Failed to query the database for existing rules: ' + err);
                callback(err);
                return;
            }

            var asOf = lastGenerated;
            for (var i = 0; i < results.rows.length; i++) {
                if (results.rows[i].created_dt.getTime() > asOf.getTime()) {
                    asOf = results.rows[i].created_dt;
                }
            }

            var needsGenerating = asOf != lastGenerated;
            lastGenerated = asOf;

            if (!needsGenerating) {
                callback(null, generatedCode);
                return;
            }

            if (results.rows.length > 0) {

                var arrayOfRules = [];
                var i = 0;
                var algo = 'if (';
                var currentGroupID = results.rows[0].group_id;

                while (i < results.rows.length) {
                    var row = results.rows[i];

                    var groupID = row.group_id;
                    var classType = row.class;
                    var property = row.property;
                    var operator = camelize(row.operator);
                    var value = row.value;
                    var onNext = row.relationtonext == 'And' ? ' && ' : ' || ';

                    // Build part of the string 
                    algo += '_' + classType + '(user.' + property + ').' + operator +
                        '("' + value + '")';

                    var nextCounter = i + 1;

                    if (nextCounter < results.rows.length && results.rows[nextCounter].group_id === groupID) {
                        algo += onNext;
                    } else {
                        // Add the end of the string
                        algo += ') {\n\t' + 'Group.push(' + groupID + '); \n}\n\n';
                        if (nextCounter < results.rows.length) {
                            algo += 'if(';
                        }
                    }

                    i++;
                }

                var rulesRuntime = fs.readFileSync('rulesRuntime.js', 'utf-8');
                generatedCode = rulesRuntime + '\n\n' + algo;
                // console.log(generatedCode);
                callback(null, { needsGenerating: needsGenerating, source: generatedCode });
            } // End if query returns results
        }); // End query to collect rules

    function camelize(str) {
        if (str) {
            return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
                if (+match === 0)
                    return ""; // or if (/\s+/.test(match)) for white spaces
                return index == 0 ? match.toLowerCase() : match.toUpperCase();
            });
        }
        return "";
    }
}

var script = null;

function getDynamicAudienceCode(connection, callback) {
    createDynamicAudienceCode(connection, function(err, result) {
        if (err) {
            logger.error('Failed to create rules code: ' + err);
            callback(err);
            return;
        }

        if (result.needsGenerating || (!script)) {
            console.log("generating new script");
            script = new vm.Script(result.source);
        }
        callback(null, script);
    });

}

function updateDynamicInviewAudiences(uid, connection, callback) {

    if (!uid || !connection)
        throw "missing argument"

    //console.info('Getting inview user details for user: ' + uid);
    // Search for all Inview User audience associations that are set to dynamic and remove them
    connection.query('SELECT inview_user_id, email, password, first_name, last_name, title, manager, company, department, address1, address2, \
        city, state, zip, country, phone_office, phone_mobile, meta01, meta02, meta03, meta04, meta05, meta06, meta07, meta08, meta09, meta10, \
        meta11, meta12, meta13, meta14, meta15, meta16, meta17, meta18, meta19, meta20 FROM inview_users_r WHERE inview_user_id=$1;', [uid],
        function(err, details) {
            if (err) {
                logger.error("Database retrieval for " + uid + " from [inview_users_r] has failed: " + err);
                callback(err);
                return;
            }


            if (details.rows.length > 0) {
                var user = details.rows[0];
                getDynamicAudienceCode(connection, function(err, result) {
                    if (err) {
                        logger.error('Failed to create rules code: ' + err);
                        callback(err);
                        return;
                    }

                    var script = result;
                    var sandbox = { user: user, Group: [], console: console };
                    script.runInNewContext(sandbox);

                    connection.query('DELETE FROM inview_users_groups_r IG WHERE ig.inview_user_id = $1 AND (ig.inview_usergroup_id IN \
                    (SELECT inview_usergroup_id FROM inview_groups_r WHERE dynamic = 1));', [uid], function(err, result) {
                        if (err) {
                            logger.error("Database dynamic group cleanup for " + uid + " from [inview_users_groups_r] has failed: " + err);
                        }

                        var values = '';
                        var audience = sandbox.Group;
                        if (audience.length > 0) {
                            for (var i = 0; i < audience.length; i++) {
                                if (values != "") {
                                    values = values + ",";
                                }
                                values += `(${uid},${audience[i]})`
                            }
                            //logger.info("These are the values: " + values);
                            connection.query('INSERT INTO inview_users_groups_r (inview_user_id, inview_usergroup_id) VALUES ' + values, [],
                                function(err, results) {
                                    if (err) { logger.error("Database dynamic group insertion for " + uid + " into [inview_users_groups_r] has failed: " + err); }
                                    console.log(`Add ${uid} into ${JSON.stringify(audience)}`);
                                });
                        }
                    });
                });

            } // end of rows check
        });
}

module.exports = updateDynamicInviewAudiences;