#!/bin/bash

# trap ctrl-c and call ctrl_c()
trap ctrl_c INT

me="$(whoami)"

sudo grep -q -F "$me ALL = NOPASSWD:" /etc/sudoers || sudo bash -c "echo $me' ALL = NOPASSWD: /usr/bin/killall, /bin/chown, /usr/bin/node' | (EDITOR='tee -a' visudo)"

sudo sh -c "echo 'start on desktop-start\nstop on desktop-end\nscript\ncd /usr/share/agent/app/ && ./agent.sh\nend script' > /home/$(whoami)/.config/upstart/agent-with-delay.conf"

function ctrl_c() {
        printf "[core]\ns0_detect_outputs = true;" > agentCompiz.profile && ./scriptComp.py agentCompiz.profile && compiz --replace --display :0 &
}
sleep 2
if [ "$EUID" -ne 0 ]
  then sudo killall node || : && sudo chown -R $me:$me . && (sudo node RootProcesses.js & node app.js)
else 
  echo "you cannot run this as root..."
  exit
fi
