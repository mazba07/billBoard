'use strict';

var express = require('express');
var router = express.Router();
var logger = require('log4js').getLogger('subscription'); // Require log4js
var subscriptions = require('../models/subscriptions-cache');
var pg = require('pg');
var getTenantDB = require('../db');
var config = require('../config/settings');
var Tenant = require('../tenant');

// Set the logging variable to the server category(optional)
// var logger = log4js.getLogger('server');

// // Append logging settings
// log4js.configure({
//     appenders: [
//         { type: 'console' },
//         { type: 'file', filename: 'logs/server.log', category: 'server' }
//     ]
// });

// logger.setLevel(config.log.level);

/**
 * Validates a sql query
 * @param {String} p0 The Tenant Id
 * @param {String} p1 The query to validate
 */
router.post('/validate', (req, res) => {
    // get the tenant id
    var tenant = Tenant.fromReq(req);

    var blob = {};
    if (req.busboy) {
        req.busboy.on('field', function(key, value, keyTruncated, valueTruncated) {
            blob[key] = value;
        });

        req.busboy.on('finish', function() {
            try {
                
                var query = blob['p1'];

                // need to ensure that all the appropriate parameters are set
                if (tenant === undefined || query === undefined) {
                    logger.error('Tenant ' + tenant + ' ', 'Could not detect all the required parameters in the request body');
                    res.status(400).send({ status: 400, error: "Could not detect required parameters in the request body" });
                    return;
                }
            } catch (err) {
                logger.error('Tenant ' + tenant + ' ', "Could not detect all the required parameters in the request body: " + err);
                res.status(400).send({ status: 400, error: "Could not detect required parameters in the request body" });
                return;
            }

            // split the string to see if we have multiple queries
            var arr = query.split(';');

            // loop the array
            for (var i = 0; i < arr.length; i++) {
                if (arr[i].length < 6) {
                    logger.error('Tenant ' + tenant + ' ', arr[i], "Invalid query detected.");
                    res.status(400).send({ status: 400, error: "Could not detect a valid sql query" });
                    return;
                }
                // need to test each and ensure that we don't have dml injected somewhere
                // trim any whitespace from the end and beginning
                var isClean = isSanitized(arr[i]);
                if (!isClean) {
                    logger.error('Tenant ' + tenant + ' ', arr[i], "Invalid query detected.");
                    res.status(400).send({ status: 400, error: "Could not detect a valid sql query" });
                    return;
                }
            }

            getTenantDB(tenant).connect(function(err, client, done) {
                if (err) {
                    done();
                    var msg = queryErrorParser(err, "An error occured connecting to database");
                    logger.error('Tenant ' + tenant + ' ', err);
                    res.status(500).send(msg);
                    return;
                }

                client.query(query, function(err1, results1) {
                    done();
                    if (err1) {
                        var msg1 = queryErrorParser(err1);
                        logger.error('Tenant ' + tenant + ' ', err1);
                        res.status(500).send(msg1);
                        return;
                    }
                    res.status(200).send({ status: 200, message: 'Success' });
                });
            });
        });

        req.pipe(req.busboy);
    }
});

/**
 * Gets the requested data for the specified tenant. 
 * JSON request parameters
 * {"p0": 0, "p1": 1, "p2": 2, "p3": 3, "p4": 4, "p5": 5, "p6": 6} 
 * @param {String} p0 The Tenant Id
 * @param {String} p1 The Layout Id
 * @param {String} p2 The Subscription Id
 * @param {Number} p3 The Sequence Id - This number should be 0 to begin
 * @param {String} p4 The Query
 * 
 * @returns {string} The results in JSON format
 */
router.post('/getdata', (req, res) => {
    // get the tenant id
    var tenant = Tenant.fromReq(req);
    var blob = {};
    if (req.busboy) {
        req.busboy.on('field', function(key, value, keyTruncated, valueTruncated) {
            blob[key] = value;
        });

        req.busboy.on('finish', function() {
            try {
                var layoutid = blob['p1'];
                var subscriptionId = blob['p2'];
                var sequenceid = blob['p3'];
                var query = blob['p4'];

                // need to ensure that all the appropriate parameters are set
                if (tenant === undefined || layoutid === undefined ||
                    subscriptionId == undefined || sequenceid === undefined || query === undefined) {
                    logger.error('Tenant ' + tenant + ' ', 'Could not detect all the required parameters in the request body');
                    res.status(400).send({ status: 400, error: "Could not detect required parameters in the request body" });
                    return;
                }
            } catch (err) {
                logger.error('Tenant ' + tenant + ' ', "Could not detect all the required parameters in the request body: " + err);
                res.status(400).send({ status: 400, error: "Could not detect required parameters in the request body" });
                return;
            }

            // split the string to see if we have multiple queries
            var arr = query.split(';');

            // loop the array
            for (var i = 0; i < arr.length; i++) {
                if (arr[i].length < 6) {
                    logger.error('Tenant ' + tenant + ' ', arr[i], "Invalid query detected.");
                    res.status(400).send({ status: 400, error: "Could not detect a valid sql query" });
                    return;
                }
                // need to test each and ensure that we don't have dml injected somewhere
                // trim any whitespace from the end and beginning
                var isClean = isSanitized(arr[i]);
                if (!isClean) {
                    logger.error('Tenant ' + tenant + ' ', arr[i], "Invalid query detected.");
                    res.status(400).send({ status: 400, error: "Could not detect a valid sql query" });
                    return;
                }
            }
            query = setQueryLimit(arr[0]);

            var json;
            var results;

            getTenantDB(tenant).connect(function(err, client, done) {
                if (err) {
                    done();
                    var msg = queryErrorParser(err, "An error occured connecting to database");
                    logger.error('Tenant ' + tenant + ' ', err);
                    res.status(400).send(msg);
                    return;
                }

                client.query(query, function(err3, results3) {
                    done();
                    if (err3) {
                        var msg1 = queryErrorParser(err3, "Error occured executing query");
                        logger.error('Tenant ' + tenant + ' ', query, err3);
                        res.status(400).send(msg1);
                        return;
                    }

                    // check to see if the subscription already exists
                    var subexists = subscriptions.exists(tenant, layoutid, subscriptionId);

                    // get the data
                    var data = generateData(results3.fields, results3.rows);

                    var curseq = parseInt(sequenceid);
                    if (subexists && curseq > 0) {
                        // get the existing subscription
                        var previous = subscriptions.read(tenant, layoutid, subscriptionId);
                        var prevseq = parseInt(previous.sequence);

                        // get the previous
                        var prevdata = JSON.parse(previous.data);

                        if (curseq == (prevseq + 1)) {
                            results = generateDeltas(tenant, layoutid, subscriptionId, curseq, prevdata, data);
                        } else {
                            results = generateAllData(tenant, layoutid, subscriptionId, curseq, previous.schema, data, false, true);
                        }
                        // update the subscription item
                        subscriptions.update(tenant, layoutid, subscriptionId, curseq, query, JSON.stringify(data), previous.schema);

                    } else {
                        var schema = generateSchema(results3.fields);
                        // get the completed json
                        results = generateAllData(tenant, layoutid, subscriptionId, 0, schema, data, true);
                        // create the subscription item
                        subscriptions.create(tenant, layoutid, subscriptionId, 0, query, JSON.stringify(data), JSON.stringify(schema));
                    }

                    // stringify the results
                    json = JSON.stringify(results);
                    // send the results back.
                    res.status(200).send(json);
                });

                //res.send(json);
            });
        });

        req.pipe(req.busboy);
    } else {
        res.status(400).send({ status: 400, error: "Request could not be processed" });
    }
});

function queryErrorParser(err, defaultmsg) {
    var msg = { status: 500, error: defaultmsg };
    switch (err.code) {
        case '42703':
            msg.status = 501;
            msg.error = "Column does not exist";
            break;
        case '42P01':
            msg.status = 502;
            msg.error = "Table does not exist";
            break;
    }
    return msg;
}

// helper method to validate the SQL query and make ensure
// we don't have any DML
function isSanitized(query) {
    return query.trim().substring(0, 6).toLowerCase() == "select";
}

function setQueryLimit(query) {
    // need to add a limit settings
    query = query.replace('limit', 'LIMIT');
    var limitSplit = query.split('LIMIT');
    if (limitSplit.length == 2) {
        // get the number
        var limitVal = parseInt(limitSplit[1].trim());
        if (limitVal > parseInt(config.database.rowlimit)) {
            query = limitSplit[0] + ' LIMIT ' + config.database.rowlimit;
        }
    } else {
        query += ' LIMIT ' + config.database.rowlimit;
    }
    return query;
}

// get all the data and return a json string
function generateAllData(tenantid, layoutid, subscriptionid, sequenceid, fields, data, includeSchema = true, sequenceReset = false) {
    var element = {};
    element.p0 = tenantid;
    element.p1 = layoutid;
    element.p2 = subscriptionid;
    element.p3 = sequenceid;
    if (sequenceReset) {
        element.p4 = sequenceReset;
    }
    if (includeSchema) {
        element.s = fields;
    }
    element.d = data;

    return element;
}

// generate the deltas
function generateDeltas(tenantid, layoutid, subsriptionid, sequenceid, previous, update) {
    var element = {};
    element.p0 = tenantid;
    element.p1 = layoutid;
    element.p2 = subsriptionid;
    element.p3 = sequenceid;
    var previousKeys = {};
    var updatedKeys = {};

    var data = [];
    var remove = [];

    // loop through the updates and see if there are any variants
    for (var i = 0; i < update.length; i++) {
        var obj = update[i];
        for (var key in obj) {
            updatedKeys[key] = obj[key];
        }
    }

    // loop through the previous and see if there are any variants
    for (var i = 0; i < previous.length; i++) {
        var obj = previous[i];
        for (var key in obj) {
            previousKeys[key] = obj[key];
        }
    }

    // see 
    for (var dkey in previousKeys) {
        if (!updatedKeys[dkey]) {
            remove.push(dkey);
        }
    }

    // now that we have to dictionaries of unique keys, compare the values
    // and add any updates to the new data.
    for (var ukey in updatedKeys) {
        // if it contains, then we need to figure out
        // if any values have changed        
        if (previousKeys[ukey]) {

            var d = {};
            d[ukey] = {};
            var valuesChanged = false;

            // get the updated values for this key
            var uvalues = updatedKeys[ukey];

            // get the previous values
            var pvalues = previousKeys[ukey];

            // loop the updvalues
            for (var ukey2 in uvalues) {

                // see if this value exists
                if (pvalues[ukey2]) {

                    // get update updated value
                    var uval = uvalues[ukey2];

                    // get the previous value
                    var pval = pvalues[ukey2];

                    // add to the list
                    if (uval != pval) {
                        valuesChanged = true;
                        d[ukey][ukey2] = uval;
                    }

                }
            }
            if (valuesChanged) {
                data.push(d);
            }
        } else {

            var d = {};
            d[ukey] = {};

            // get the updated values for this key
            var uvalues = updatedKeys[ukey];

            // loop the updvalues
            for (var ukey2 in uvalues) {

                // get update updated value
                var uval = uvalues[ukey2];
                d[ukey][ukey2] = uval;
            }

            data.push(d);
        }
    }

    element.kd = remove;
    element.d = data;
    return element;
}

// generate the schema object
function generateSchema(fields) {
    var schema = [];

    for (var i in fields) {
        var f = {};
        f['s0'] = fields[i].name;
        f['s1'] = fields[i].dataTypeID;
        f['s2'] = 'a' + i;

        // add it to the fields
        schema.push(f);
    }

    return schema;
}

// generate the data object.
function generateData(fields, rows) {
    var data = [];

    // add the data 
    for (var i in rows) {
        var d = {};
        var key = 'r' + i;
        d[key] = {};

        // loop the fields again to get the correct data
        for (var f in fields) {
            var temp = {};
            d[key]['a' + f] = rows[i][fields[f].name];
        }

        // add the data element
        data.push(d);
    }

    return data;
}

/**
 * helper method to translate the mysql datatypes into maestro datatypes
 * @param {Number} dt The data type returned by mysql field datatype. 
 */
function mysqlDataTypeToInternalType(dt) {
    switch (dt) {
        case 2:
        case 3:
            return 1;
        case 4:
        case 5:
        case 246:
            return 3;
        case 1:
        case 16:
            return 4;
        case 7:
        case 10:
        case 12:
            return 5;
        default:
            return 2;
    }
}

module.exports = router;