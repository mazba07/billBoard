(function () {'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var path = _interopDefault(require('path'));
var jetpack = _interopDefault(require('fs-jetpack'));
var electron = require('electron');

var configFile;
var config = {};

config.load = function() {
    configFile = path.join(electron.app.getPath('userData'), 'config.json');
    if (jetpack.exists(configFile)) {
        try {
            config.settings = jetpack.read(configFile, 'json');
        } catch (err) {
            config.settings = {};
            console.error(err);
        }
    } else {
        config.settings = {};
    }
};

config.save = function() {
    if (configFile) {
        jetpack.write(configFile, JSON.stringify(config.settings), 'utf-8');
    } else {
        throw 'config file name not set, you must load before you save.';
    }
};

module.exports = config;

}());
//# sourceMappingURL=config.js.map