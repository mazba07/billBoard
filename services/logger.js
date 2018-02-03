var moment = require('moment'); // Time Library
var log4js = require('log4js'); // Require log4js
var config = require('./config/settings'); // Import custom settings

// Append logging settings
currentDate = new Date();
log4js.configure({
    appenders: [
        { type: 'console' },
        { type: 'file', filename: 'logs/' + moment(currentDate).format("YYYY-MM-DD HH:mm") + '-server.log', category: 'services', maxLogSize: 20480}
    ], replaceConsole: true
});

// Set the logging variable to the server category(optional)
var logger = log4js.getLogger('WebServices');

// Set the logging level according to the settings.js
logger.setLevel(config.log.level);

module.exports = logger;