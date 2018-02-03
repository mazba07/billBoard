// This is main process of Electron, started as first thing when your
// app starts. This script is running through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.

import path from 'path';
import url from 'url';
import { app, Menu, BrowserWindow, Tray, ipcMain, screen, dialog } from 'electron';
import { devMenuTemplate } from './menu/dev_menu_template';
import { stdMenuTemplate } from './menu/std_menu_template';
import createWindow from './helpers/window';
import PlayerEngine from "./PlayerEngine";
import request from "request";
import fs from 'fs-jetpack';
import process from 'process';
import childProcess from 'child_process';

// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from './env';

import config from './config';

var mainWindow;
var loginWindow;
var tenantWindow;
var alertsWindow;
const iconPath = path.join(__dirname, "InView.png");
var appIcon;
var player;
var eNotify;
var loginDetails;
var userDetails;
var dataSettings;
var snoozeTimer;
var contextMenu;
var monitor;

var setApplicationMenu = function(option) {
    if (option === null) {
        Menu.setApplicationMenu(null);
    } else {
        var menus = [stdMenuTemplate];
        if (env.name !== 'production') {
            menus.push(devMenuTemplate);
        }
        Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
    }
};

// Save userData in separate folders for each environment.
// Thanks to this you can use production and development versions of the app
// on same machine like those are two separate apps.
if (env.name !== 'production') {
    var userDataPath = app.getPath('userData');
    app.setPath('userData', userDataPath + ' (' + env.name + ')');
}

app.on('ready', function() {
    monitor = screen.getPrimaryDisplay().workAreaSize;
    config.load();

    if (config.settings.tenant_token) {
        startInview();
    } else {
        tenantWindow = createWindow('getTenant', {
            width: 500,
            height: 440,
            show: true,
            center: true,
            resizable: false,
            skipTaskBar: true,
            title: "InView get tenant token",
            minimizable: false,
            maximizable: false,
            alwaysOnTop: false,
            closable: true
        });

        ipcMain.once('provisioningResults', function(event, arg) {
            try {
                tenantWindow.hide();
                var pr = JSON.parse(arg);
                config.settings.cms = pr.cms;
                config.settings.webService = pr.webService;
                config.settings.tenant_token = pr.tenant_token;
                config.save();
                startInview();
            } catch (err) {

            }
        });
        setApplicationMenu(null);
        tenantWindow.loadURL(path.join(__dirname, 'GetTenantToken.html'));
    }
});
app.on('window-all-closed', function() {
    app.quit();
});

function getInviewUri() {
    var refresh = 15;
    if (config.settings.refreshRate) {
        refresh = +config.settings.refreshRate;
    }
    return config.settings.cms + `/prt/inview.html?services=${config.settings.webService}&refresh=${refresh}`;
}

function startInview() {
    appIcon = new Tray(iconPath);

    eNotify = require('electron-notify');
    eNotify.setConfig({
        appIcon: iconPath,
        displayTime: 60000
    });

    loginWindow = createWindow('login', {
        width: 618,
        height: 590,
        show: true,
        center: true,
        resizable: false,
        skipTaskBar: true,
        title: "InView Login",
        minimizable: false,
        maximizable: false,
        alwaysOnTop: true,
        closable: true
    });

    // setTimeout(function() { loginWindow.webContents.openDevTools(); }, 1000);

    if (tenantWindow) {
        setTimeout(function() {
            if (tenantWindow) {
                tenantWindow.destroy();
                tenantWindow = null;
            }
        }, 1000);
    }

    ipcMain.once('loginResults', function(event, arg) {
        try {
            //console.info(arg);
            var loginResults = JSON.parse(arg);
            loginDetails = loginResults.loginDetails;
            userDetails = loginResults.userDetails;
            dataSettings = loginResults.dataSettings;

            if (contextMenu) {
                for (var i = 0; i < contextMenu.items.length; i++) {
                    if (contextMenu.items[i].label == 'Snooze') {
                        // console.info(`Setting ${contextMenu.items[i].label} to ${userDetails.snooze == 1}`);
                        contextMenu.items[i].enabled = userDetails.snooze == 1;
                    }
                }
                appIcon.setContextMenu(contextMenu);
            }

            setInterval(checkForAlerts, 20000);
            var initialHeight = Math.floor(monitor.height * .80);
            var initialWidth = Math.floor((initialHeight / 16) * 9);
            var options = {
                width: initialWidth,
                height: initialHeight,
                useContentSize: true,
                center: true,
                show: true,
                frame: false,
                transparent: true,
                maximizable: false,
                minimizable: userDetails.snooze == 1,
                resizable: userDetails.resizable == 1,
                alwaysOnTop: userDetails.always_on_top == 1,
                closable: false
            };

            var lastPositionFile = path.join(app.getPath('userData'), 'lastposition.json');
            console.info(lastPositionFile);
            if (fs.exists(lastPositionFile)) {
                var hadError = false;
                var bounds;
                try {
                    console.info("Loading " + lastPositionFile);
                    var ws = fs.read(lastPositionFile, 'utf-8');
                    bounds = JSON.parse(ws);
                    options.x = bounds.x;
                    options.y = bounds.y;
                    options.width = bounds.width;
                    options.height = bounds.height;
                } catch (err) {
                    console.error(err);
                    hadError = true;
                }
                console.info(JSON.stringify(options));
                mainWindow = createWindow('main', options);
                if (!hadError) {
                    setTimeout(function() {
                        console.info("Bounds read from file: " + JSON.stringify(bounds));
                        if (bounds.width > monitor.width) {
                            bounds.width = monitor.width;
                        }

                        if (bounds.height > monitor.height) {
                            bounds.height = monitor.height;
                        }

                        if ((bounds.x + bounds.width) > monitor.width) {
                            bounds.x = (monitor.width - bounds.width) / 2;
                        }

                        if ((bounds.y + bounds.height) > monitor.height) {
                            bounds.y = (monitor.height - bounds.height) / 2;
                        }
                        console.info("Setting bounds to: " + JSON.stringify(bounds));
                        mainWindow.setBounds(bounds);
                    }, 1000);
                }
            } else {
                mainWindow = createWindow('main', options);
            }


            mainWindow.loadURL(path.join(__dirname, 'PageHost.html'));

            if ((userDetails.snooze == 1) && (userDetails.duration_of_snooze > 0)) {
                console.info('Setting a minimize (snooze) event handler');

                mainWindow.on('minimize', function(e) {
                    if (snoozeTimer) {
                        clearTimeout(snoozeTimer);
                        snoozeTimer = undefined;
                    }
                    var minutes = userDetails.duration_of_snooze;
                    var units;

                    console.info(`Setting a snooze timer for ${userDetails.duration_of_snooze} minutes`);
                    snoozeTimer = setTimeout(function() {

                        snoozeTimer = undefined;
                        if (mainWindow.isMinimized()) {
                            console.info("Time for snoozing is over, waking up and restoring the window");
                            mainWindow.restore();
                        }
                    }, minutes * 60 * 1000);
                });
            }

            ipcMain.on('ready', function() {
                var uri = getInviewUri();
                console.info("Launching: " + uri);
                var req = { cmd: 'goto', args: [uri] };
                mainWindow.webContents.send('request', JSON.stringify(req));
            });

            ipcMain.on('message', function(event, msgString) {
                try {
                    console.info('Received: ' + msgString);
                    var msg = JSON.parse(msgString);
                    switch (msg.cmd.toLowerCase()) {
                        case 'getloginresults':
                            console.info('Sending login results');
                            var lr = { type: 'loginResults', loginDetails: loginDetails, userDetails: userDetails };
                            event.sender.send('loginResults', JSON.stringify(lr));
                            break;
                        case 'snooze':
                            mainWindow.minimize();
                            break;
                        case 'poptotop':
                            if (mainWindow.isMinimized) {
                                mainWindow.restore();
                            } else {
                                mainWindow.minimize();
                                setTimeout(function() { mainWindow.restore(); }, 100);
                            }
                            break;
                        case 'setwindowtitle':
                            if (mainWindow) {
                                mainWindow.setWindo
                            }
                            break;
                        case 'setwindowsize':
                            if (mainWindow) {
                                var pos = mainWindow.getBounds();
                                var arg = msg.arg;
                                var anchor = 'top';
                                if (arg.anchor) {
                                    anchor = arg.anchor.toLowerCase();
                                }

                                arg.width = arg.width === undefined ? pos.width : arg.width;
                                arg.height = arg.height === undefined ? pos.height : arg.height;
                                if (arg.width < 1) {
                                    arg.width = pos.width;
                                }
                                if (arg.height < 1) {
                                    arg.height = pos.height;
                                }

                                switch (anchor) {
                                    case 'bottomleft':
                                    case 'bl':
                                    case 'bottom':
                                    case 'b':
                                        pos.y += pos.height - arg.height;
                                        break;
                                    case 'topright':
                                    case 'tr':
                                    case 'right':
                                    case 'r':
                                        pos.x += pos.width - arg.width;
                                        break;
                                    case 'bottomright':
                                    case 'br':
                                        pos.y += pos.height - arg.height;
                                        pos.x += pos.width - arg.width;
                                        break;
                                    case 'center':
                                    case 'c':
                                        pos.y += Math.floor((pos.height - arg.height) / 2);
                                        pos.x += Math.floor((pos.width - arg.width) / 2);
                                        break;
                                }
                                pos.width = arg.width;
                                pos.height = arg.height;
                                mainWindow.setBounds(pos);
                            }
                            break;
                    }
                } catch (err) {
                    console.error(err);
                }
            });

            if (loginWindow) {
                loginWindow.destroy();
                loginWindow = null;
            }

            setApplicationMenu(null);
        } catch (err) {
            console.error('Error getting loginDetails ' + err);
        }
    });

    var loginUri = path.join(__dirname, "login-inview.html") + `?cms=${config.settings.cms}&webService=${config.settings.webService}&tenant_token=${config.settings.tenant_token}`;
    console.info(loginUri);
    loginWindow.loadURL(loginUri);

    var contextMenuTemplate = [{
        label: 'Alerts History',
        click: showAlerts
    }, {
        label: 'Reload',
        click: function() {
            if (mainWindow) {
                mainWindow.webContents.reloadIgnoringCache();
            }
        }
    }];

    if (env.name !== 'production') {
        contextMenuTemplate.push({
            label: 'Electron DevTools',
            click: function() {
                if (mainWindow) {
                    mainWindow.toggleDevTools();
                }
            }
        });
    }

    contextMenuTemplate.push({
        label: 'DevTools',
        click: function() {
            if (mainWindow) {
                var req = { cmd: 'debug', args: [getInviewUri()] };
                mainWindow.webContents.send('request', JSON.stringify(req));
            }
        }
    });

    contextMenuTemplate.push({
        label: 'Clear Cache',
        click: function() {
            if (mainWindow) {
                mainWindow.webContents.session.clearCache(function() {
                    mainWindow.webContents.reloadIgnoringCache();
                });
            }
        }
    });

    contextMenuTemplate.push({
        label: 'Snooze',
        click: function() {
            if (mainWindow) {
                mainWindow.minimize();
            }
        },
        enabled: false
    });

    contextMenuTemplate.push({
        label: 'Logout',
        click: logout
    });

    contextMenuTemplate.push({
        label: 'Exit',
        click: playerExit
    });

    contextMenu = Menu.buildFromTemplate(contextMenuTemplate);

    appIcon.setContextMenu(contextMenu);

    appIcon.setToolTip("KORBYT™ INVIEW");

    setApplicationMenu(null);
}

var notificationIndex = 0;

var lastAlert = 0;
var lastAlertFile;

function notifyClickHandler(event) {
    //console.info('notification clicked');
    event.closeNotification();
}

function checkForAlerts() {
    if (lastAlertFile === undefined) {
        lastAlertFile = path.join(app.getPath('userData'), 'lastAlert.txt');
        if (fs.exists(lastAlertFile)) {
            var ws = fs.read(lastAlertFile, 'utf-8');
            lastAlert = parseInt(ws);
        }
    }

    if (!loginDetails) {
        // not logged in
        return;
    }

    var options = {
        url: config.settings.webService + '/v1/alerts?iid=' + loginDetails.id + '&last=' + lastAlert,
        headers: {
            'Authorization': `Bearer ${loginDetails.accessToken}`
        }
    };

    //console.log(options);
    request(options, function(err, response, results) {
        if (err) {
            console.error('Unable to poll for alerts: ' + err);
            return;
        }
        var alerts = JSON.parse(results);
        for (var a = 0; a < alerts.length; a++) {
            var alert = alerts[a];
            alert.id = +alert.id; // Make sure it is an number
            if (alert.id > lastAlert) {
                lastAlert = alert.id;
                fs.write(lastAlertFile, lastAlert.toString(), 'utf-8');
            }
            eNotify.notify({
                title: 'InView Notification',
                text: `${alert.message}`,
                onClickFunc: notifyClickHandler
            });
        }
    });
}

function playerExit() {
    {
        if (player) {
            player.stop();
            player = undefined;
        }
        appIcon.destroy();
        if (loginWindow) {
            loginWindow.destroy();
            loginWindow = undefined;
        }

        if (alertsWindow) {
            alertsWindow.destroy();
            alertsWindow = undefined;
        }

        if (mainWindow) {
            var bounds = mainWindow.getBounds();
            var lastPositionFile = path.join(app.getPath('userData'), 'lastposition.json');
            console.info("Saving " + lastPositionFile);
            fs.write(lastPositionFile, JSON.stringify(bounds), 'utf-8');
            mainWindow.destroy();
            mainWindow = undefined;
        }

        if (eNotify) {
            eNotify.closeAll();
            eNotify = undefined;
        }
    }
}

function logout() {
    var uri = config.settings.webService + '/v1/logout';
    console.info(uri);
    var options = {
        url: uri,
        headers: { Authorization: 'Bearer ' + loginDetails.accessToken }
    };
    request(options, function(err, response, results) {
        if (err) {
            console.error('Unable to poll for logout: ' + err);
            return;
        }
        console.info(JSON.stringify(results));
        console.info("Logged out");
        console.info(process.cwd());

        var args = Array.from(process.argv);
        if (args.length > 1) {
            args = args.slice(1);
        } else {
            args = [];
        }
        childProcess.spawn(process.argv0, args, { cwd: process.cwd(), detached: true });
        playerExit();
        // childProcess.exec(process.argv.join(' '), { cwd: process.cwd() });
        // playerExit();
    });
}

function showAlerts() {
    if (alertsWindow) {
        alertsWindow.minimize();
        alertsWindow.focus();
        if (env.name !== 'production') {
            alertsWindow.toggleDevTools();
        }
        return;
    }

    alertsWindow = createWindow('alertsWindow', {
        width: Math.floor(monitor.width / 2),
        height: Math.floor(monitor.height * .80),
        show: true,
        center: true,
        resizable: true,
        skipTaskBar: false,
        title: "My alerts",
        minimizable: true,
        maximizable: true,
        alwaysOnTop: false,
        closable: true
    });

    alertsWindow.on('close', function() {
        setTimeout(function() {
            if (alertsWindow) {
                alertsWindow = undefined;
            }
        }, 1000);
    });

    alertsWindow.loadURL(
        path.join(__dirname, "myalerts.html") + `?cms=${config.settings.cms}&webService=${config.settings.webService}`
    );
}

// function doNotification() {
//     var samples = [
//         "Notification Title|Body text, can also contain URL, sound and 2nd icon",
//         "Weather Alert|Tornado Warning, seek shelter immediately",
//         "Threshold Exceeded|CIQ(20) > 15",
//         "Meeting|Daily standup begins in 15 minutes",
//         "Albert Einstein|Insanity: doing the same thing over and over again and expecting different results",
//         "Albert Einstein|We cannot solve our problems with the same thinking we used when we created them",
//         "Bored?|Eric sure can drone on and on"
//     ];

//     var parts = samples[notificationIndex].split('|');
//     notificationIndex = (notificationIndex + 1) % samples.length;
//     eNotify.notify({ title: parts[0], text: parts[1] });
// }