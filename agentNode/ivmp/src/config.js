import path from 'path';
import jetpack from 'fs-jetpack';
import { app } from 'electron';

var configFile;
var config = {};

config.load = function() {
    configFile = path.join(app.getPath('userData'), 'config.json');
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
}

config.save = function() {
    if (configFile) {
        jetpack.write(configFile, JSON.stringify(config.settings), 'utf-8');
    } else {
        throw 'config file name not set, you must load before you save.';
    }
}

export default config;