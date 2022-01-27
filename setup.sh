# Install nvm/nodejs if it hasn' been done already
if ! command -v nvm &>/dev/null; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash

  # Get nvm working now
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

  # Install the desired nodejs version
  nvm install v16.13.2
fi

# Install dependencies with npm
npm i

# Install apache2
sudo apt-get install apache2 -y
sudo a2enmod proxy
sudo a2enmod proxy_http

# Copy config
sudo cp 000-default.conf /etc/apache2/sites-available/000-default.conf

# Make ~/frontend our website html
sudo rm -rf /var/www/html
sudo ln -s ./frontend /var/www/html

# Restart apache
sudo systemctl restart apache2
