'use strict';

var subscriptions = [];
const Subscription = require('./subscription');

// update or create a new subscription objevct
exports.update = exports.create = function(tenantid, layoutid, subscriptionid, sequence, query, data, schema){
    var key = buildkey(tenantid, layoutid, subscriptionid);
    if (subscriptions[key]){
        // update the values
        subscriptions[key].sequence = sequence;
        subscriptions[key].data = data;
        subscriptions[key].schema = schema;
        subscriptions[key].lastupdated = Date.now();
    } else {
        subscriptions[key] = new Subscription(tenantid, layoutid, subscriptionid, sequence, query, data, schema);
    }
};

// get a individual subscription
exports.read = function(tenantid, layoutid, subscriptionid){
    var key = buildkey(tenantid, layoutid, subscriptionid);
    if (subscriptions[key]){
        return subscriptions[key];
    }else{
        throw `Subscription ${key} does not exist`;
    }
}

/**
 * List all the subscriptions
 * 
 * @param {Number} [tenantid] The tenant id to filter the list by
 */
// exports.list = function(tenantid = -1){
//     var results = {};
//     for (var s in subscriptions){
//         results[s] = subscriptions[s];
//     }
//     return results;
// }

// remove a subscription
exports.destroy = function(tenantid, layoutid, subscriptionid){
    var key = buildkey(tenantid, layoutid, subscriptionid);
    if (subscriptions[key]){
        delete subscriptions[key];
    }
}

// check for existance
exports.exists = function(tenantid, layoutid, subscriptionid){
    var key = buildkey(tenantid, layoutid, subscriptionid);
    if (subscriptions[key]){
        return true;
    }

    return false;
}

// get the number of subscriptions
exports.count = function(){
    Object.keys(subscriptions);
};

// function to build a unique key
// key is tenantid_subscriptionid_playerid_pageid
function buildkey(tenantid, layoutid, subscriptionid){
    return tenantid.toString() + '_' + subscriptionid.toString() + '_' + layoutid.toString();
}

/**
 * Handles cleanup of expired subscriptions
 * Removes subscriptions that haven't been used in the past 60 minutes.
 */
var interval = setInterval(function(){
    var expired = [];
    for (var s in subscriptions){
        if (subscriptions[s].isSubscriptionExpired((60 * 60))){
            expired.push(s);
        }
    }

    for (var i = 0; i < expired.length; i++){
        if (subscriptions[expired[i]]){
            delete subscriptions[expired[i]];
        }
    }
}, (1000 * 60));