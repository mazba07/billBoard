# Update Ubuntu and install zip
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt install zip -y

# Install Git
sudo apt-get install git-all -y

# Create an SSH key
# Recommendation is going to be to do this step before installing, so I'm commenting out these two lines
#ssh-keygen -C 'nasser.ali@rmgnetworks.com'
#vim /home/$USER/.ssh/id_rsa.pub

# Create the folders where Web Services will be installed
mkdir /var/www
mkdir /var/www/html

# Perform Git pull
sudo chown -R $USER:www-data /var/www/html
sudo find /var/www/html -type d -exec chmod g+s {} \;

cd /var/www/html

git init

git remote add origin ssh://rmg-dev@rmg-dev.visualstudio.com:22/DefaultCollection/_git/Maestro
git config core.sparseCheckout true

echo services >> .git/info/sparse-checkout

git pull origin master

# Install pacman
cd /var/www/html/services

# copy the service file
sudo cp player-webservice.service /lib/systemd/system
sudo systemctl daemon-reload

sudo apt install pacman -y

# Install and configure nodejs
curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
sudo apt-get install nodejs -y
sudo apt-get install build-essential node-gyp -y

#sudo npm install –g node-gyp
sudo npm install

# Install Forever and configure it to start and monitor Web Services
# sudo npm install forever -g
# cd /var/www/html/services
# sudo npm install forever-monitor

# forever start app.js

# get the status
systemctl status player-webservice

# start the service
systemctl start player-webservice