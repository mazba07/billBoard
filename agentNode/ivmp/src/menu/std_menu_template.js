import { app, BrowserWindow } from 'electron';

export var stdMenuTemplate = {
    label: 'Menu',
    submenu: [{
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: function() {
            BrowserWindow.getFocusedWindow().webContents.reloadIgnoringCache();
        }
    }]
};