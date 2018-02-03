'use strict';

/*
The player will pass in a sequence id, if the value is 0, then
we need to return the full data result with the appropriate 
schema. All other subsequent requests only utilizes the deltas.
If the player requests 4 and the server is on a different version,
the results should indicate such to the player along with the full
data subscription in order that they may process the full results

// subscription defined
tenantId,
subscriptionId,
playerId,
pageId,
sequence,
schema,
data,
lastUpdated

// json request 
{
    tenantId: 21,
    subscriptionId: 123456789,
    playerId: 213546879,
    pageId: 1234,
    sequenceId: 0
}

When a getData request arrives, we need to query the appropriate tenant database
and get the subscription information from the database

------------------------------------------------------------------------------
| METHOD   |  URI                    | DESCRIPTION                           |
------------------------------------------------------------------------------
| GET      | 
*/

// object representing a single data subscription object
module.exports = class Subscription{
    constructor(tenantid, layoutid, subscriptionid, sequence = 0, query = '', data = '', schema = ''){
        this.tenantid = tenantid;
        this.layoutid = layoutid;
        this.subscriptionid = subscriptionid;
        this.query = query;
        this.sequence = sequence;
        this.data = data;
        this.schema = schema;
        this.lastupdated = Date.now();
    };

    // checks to see if we have had a refresh of data
    // within the alloted pollrate
    // isDataValid(pollRate){
    //     var currentDt = Date.now();
    //     var seconds = parseInt((currentDt - this.lastupdated)/1000);

    //     if (seconds > pollRate){
    //         return false;
    //     }else{
    //         return true;
    //     }
    // };

    /**
     * Helper method to determine if the subscription is still valid?
     * 
     * @param {Number} maxAge The maximum age a subscription can be before it is considered expired. 
     */
    isSubscriptionExpired(maxAge){
        var currentDt = Date.now();
        var seconds = parseInt((currentDt - this.lastupdated)/1000);

        if (seconds > maxAge){
            return true;
        }else{
            return false;
        }
    }
};