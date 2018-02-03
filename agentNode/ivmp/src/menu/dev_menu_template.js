import { app, BrowserWindow } from 'electron';

export var devMenuTemplate = {
    label: 'Development',
    submenu: [{
        label: 'Toggle DevTools',
        accelerator: 'Alt+CmdOrCtrl+I',
        click: function() {
            BrowserWindow.getFocusedWindow().toggleDevTools();
        }
    }]
};