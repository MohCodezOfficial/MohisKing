#!/bin/bash

set -e

echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "Installing dependencies..."
sudo apt install -y software-properties-common apt-transport-https wget perl gnupg2

echo "Downloading Webmin GPG key..."
wget https://download.webmin.com/jcameron-key.asc
sudo mv jcameron-key.asc /etc/apt/trusted.gpg.d/webmin.asc

echo "Adding Webmin repository..."
echo "deb https://download.webmin.com/download/repository sarge contrib" | sudo tee /etc/apt/sources.list.d/webmin.list

echo "Updating package list..."
sudo apt update

echo "Installing Webmin..."
sudo apt install -y webmin

echo "Allowing Webmin through UFW firewall..."
sudo ufw allow 10000/tcp
sudo ufw reload

echo "Starting Webmin service..."
sudo systemctl enable webmin
sudo systemctl start webmin

echo "Webmin installation completed!"
echo "Access Webmin at: https://YOUR_SERVER_IP:10000"