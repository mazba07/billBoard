var dnode = require('dnode');
const exec = require('child_process').exec;
const path = require('path');
const fs = require('fs');

var server = dnode({
    makeConnection: function (accessPoint, cb) {
        connectToNetwork(accessPoint, function (resp) {
            cb(resp);
        })
    },
    setSleepSchedule: function (wakeupTime, sleepTime, days, cb) {
        setSleepSchedule(wakeupTime, sleepTime, days, function (resp) {
            cb(resp);
        })
    },
    disableSleep: function (cb) {
        disableSleep(function (resp) { cb(null) });
    },
    reboot: function (cb) {
        reboot(function (resp) { cb(null) });
    },
    standby: function (cb) {
        standby(function (resp) { cb(null) });
    },
    upgrade: function (cb) {
        upgrade(function (resp) { cb(null) });
    },
    update: function (cb) {
        update(function (resp) { cb(null) });
    }
});
server.listen(50004);

function update(cb) {
    fs.writeFileSync("update.sh", "#!/bin/sh\nsleep 1\n" + decoded.command + '\ngnome-terminal -x bash -c "./agent.sh;bash"');
    self.exit = true;
    self.driver.quit();
    var child = exec("chmod +x update.sh && ./update.sh", { shell: '/bin/bash' }, function (error, stdout, stderr) {
        if (error) logger.error('updatePlayer failed to execute update.sh with error: ', error);
    });
    process.exit();
    cb(null);
}

function upgrade(cb) {
    var file = fs.createWriteStream("/" + packageName);
    var request = http.get(self.serverInfo.serverIP + '/v1/upgradePlayer/' + packageName, function (response) {
        response.pipe(file);
        fs.writeFile("update.sh", '#!/bin/sh\nsleep 1\ndpkg -i /' + packageName + '\ngnome-terminal -x bash -c "./agent.sh;bash"', function (resp) {
            self.driver.quit();
            fs.writeFile("/tmpAgentConfig.json", JSON.stringify(self.config, null, 4), function (resp) {
                var child = exec("chmod +x update.sh && ./update.sh", { shell: '/bin/bash' }, function (error, stdout, stderr) {
                    if (error) logger.error('updatePlayer failed to execute update.sh with error: ', error);
                });
                process.exit();
                cb(null);
            });
        });
    });
}

function reboot(cb) {
    childProcess("sudo reboot", function (resp) { cb(null) });
}

function standby(cb) {
    childProcess("sudo systemctl suspend", function (resp) { cb(null) });
}

function disableSleep(cb) {
    childProcess("sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target", function (resp) { cb(null) });
}

function setSleepSchedule(wakeupTime, sleepTime, days, callback) {
    if (sleepTime && wakeupTime && sleepTime !== '' && wakeupTime !== '' && sleepTime !== 'undefined' && wakeupTime !== 'undefined') {
        childProcess('echo \" ' + sleepTime.split(':')[1] + ' ' + sleepTime.split(':')[0]
            + ' * * ' + (days ? days.toString() + ' ' : '* ') + path.dirname(require.main.filename) + '/suspend_until.sh '
            + wakeupTime + ' \" | crontab -', function (resp) { callback(null) });
    }
    else exec('crontab -r', { shell: '/bin/bash' }, function (error, stdout, stderr) { callback(null) });
}

function childProcess(cmd, callBack) {
    var child = exec(cmd, { shell: '/bin/bash' }, function (error, stdout, stderr) {
        if (error) console.log('childProcess failed with error: ', error);
    });
    var resp = "";
    child.stdout.on('data', function (buffer) { resp += buffer.toString() });
    child.stdout.on('end', function () { callBack(resp) });
}

function getWifiAdapter(callBack) {
    childProcess("iwconfig | grep 'ESSID' | awk '{ print$1 }'", function (resp) {
        callBack(resp.replace(/(\r\n|\n|\r)/gm, ""));
    });
}

function connectToNetwork(accessPoint, callback) {
    if (!accessPoint.mode.trim() || accessPoint.mode === 'client') makeClientConnection(accessPoint, function (resp) { callback(true) });
    else if (accessPoint.mode === 'adhoc') makeAdhocConnection(accessPoint, callback(true));
}

function makeClientConnection(accessPoint, connectionCallback) {
    getWifiAdapter(function (adapter) {
        childProcess('nmcli con add con-name \"' + accessPoint.ssid + '\" ifname ' + adapter + ' type wifi ssid \"'
            + accessPoint.ssid + '\"' + (accessPoint.ip4.trim() ? 'ip4 ' + accessPoint.ip4 : '')
            + (accessPoint.defaultGateway.trim() ? 'gw4 ' + accessPoint.defaultGateway : ''),
            function (resp) {
                if (accessPoint.security.length === 0) childProcess('systemctl restart NetworkManager', function (resp) { connectionCallback(null) });
                else {
                    childProcess(
                        (accessPoint.security.indexOf('802.1X') > -1 ? 'sudo echo \" \n[wifi-security]\ngroup=\nkey-mgmt=wpa-eap\npairwise=\nproto=\n'
                            + '\n[802-1x]\naltsubject-matches=\neap=peap;\nidentity=' + accessPoint.username
                            + '\npassword=' + accessPoint.password + '\nphase2-altsubject-matches=\nphase2-auth=mschapv2\n'
                            + '\" >> /etc/NetworkManager/system-connections/' + accessPoint.ssid
                            : (accessPoint.security.indexOf('WPA1') > -1 || accessPoint.security.indexOf('WPA2') > -1 ?
                                'sudo echo \" \n[wifi-security]\ngroup=\nkey-mgmt=wpa-psk\npairwise=\nproto=\npsk=' + accessPoint.password
                                + '\" >> /etc/NetworkManager/system-connections/' + accessPoint.ssid : ''
                            )
                        ), function (resp) {
                            childProcess('systemctl restart NetworkManager', function (resp) { connectionCallback && connectionCallback(null) });
                        }
                    );
                }
            });
    });
}

function makeAdhocConnection(accessPoint, connectionCallback) {
    getWifiAdapter(function (adapter) {
        childProcess('nmcli con add con-name ' + accessPoint.ssid + ' ifname ' + adapter + ' type wifi ssid '
            + accessPoint.ssid + '\nnmcli con modify ' + accessPoint.ssid + ' 802-11-wireless.mode adhoc'
            + '\nnmcli con modify ' + accessPoint.ssid + ' ipv4.method.shared\n'
            + 'echo \"\n[wifi-security]\nauth-alg=open\ngroup=\nkey-mgmt=none\npairwise=\nproto=\nwep-key-type=1\nwep-key0='
            + accessPoint.password + '\" >> /etc/NetworkManager/system-connections/' + accessPoint.ssid
            + '\nsystemctl restart NetworkManager\nrrmod iwldvm\nrrmod iwlwifi\nmodprobe iwlwifi', function (resp) { connectionCallback && connectionCallback(null) });
    });
}