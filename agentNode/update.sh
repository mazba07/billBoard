#!/bin/sh
sleep 1
dpkg -i /agent_1.0.0_all.deb
gnome-terminal -x bash -c "sudo node app.js;bash"
