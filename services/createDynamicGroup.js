var fs = require('fs'); // Allow the use of Node filesystem APIs
var vm = require('vm'); // Allow the use of the Node Sandbox

var lastGenerated = new Date(1970, 1, 1); // Never basically
var generatedCode = '';

function createDynamicGroupCode(connection, callback) {

    // Query the database and look for all of the existing rules that need to be executed
    connection.query('SELECT r.group_id, r.disposition, f.class, f.property, r.operator, r.value, r.relationtonext, r.created_dt \
        FROM rules_r R INNER JOIN rules_fields_r F ON r.field = f.rules_fields_id \
        WHERE r.group_id IN (select group_id from group_r where dynamic = 1) \
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
                    algo += '_' + classType + '(player.' + property + ').' + operator +
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

function getDynamicGroupCode(connection, callback) {
    createDynamicGroupCode(connection, function(err, result) {
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

function updateDynamicPlayerGroups(pid, connection) {

    if (!pid || !connection)
        throw "missing argument"


    // Search for all player group association that are set to dynamic and remove them
    connection.query('SELECT player_id, player_name, status, player_type, manufacturer, cpus, country, state, zip, orientation, \
        osversion, volume, wakeuptime, sleeptime FROM player_r WHERE player_id=$1', [pid],
        function(err, results) {
            if (err) {
                logger.error("Database retrieval for " + pid + " from [player_r] has failed: " + err);
            }


            if (results.rows.length > 0) {
                var player = results.rows[0];
                getDynamicGroupCode(connection, function(err, result) {
                    if (err) {
                        logger.error('Failed to create rules code: ' + err);
                        callback(err);
                        return;
                    }

                    var script = result;
                    var sandbox = { player: player, Group: [], console: console };
                    script.runInNewContext(sandbox);

                    connection.query('DELETE FROM player_group_r PG WHERE pg.player_id = $1 AND (pg.group_id IN (SELECT group_id FROM group_r WHERE dynamic = 1));', [pid], function(err, result) {
                        if (err) {
                            logger.error("Database dynamic group cleanup for " + pid + " from [player_group_r] has failed: " + err);
                        }

                        var values = '';
                        var groups = sandbox.Group;
                        if (groups.length > 0) {
                            for (var i = 0; i < groups.length; i++) {
                                if (values != "") {
                                    values = values + ",";
                                }
                                values += `(${pid},${groups[i]})`
                            }
                            connection.query('INSERT INTO player_group_r (player_id, group_id) VALUES ' + values, [], function(err, results) {
                                if (err) { logger.error("Database dynamic group insertion for " + pid + " into [player_group_r] has failed: " + err); }
                                console.log(`Add ${pid} into ${JSON.stringify(groups)}`);
                            });
                        }
                    });
                });

            } // end of rows check
        });
}

module.exports = updateDynamicPlayerGroups;