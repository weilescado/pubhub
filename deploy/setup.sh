#!/bin/bash

# Exit on error
set -e

echo "=== Starting Deployment Setup ==="

# Get current user and directory
CURRENT_USER=$(whoami)
PROJECT_ROOT=$(pwd)

echo "Current User: $CURRENT_USER"
echo "Project Root: $PROJECT_ROOT"

# 1. Update system and install dependencies
echo "--- Installing System Dependencies ---"
sudo apt update
sudo apt install -y python3-pip python3-venv nginx git

# 2. Setup Python Environment
echo "--- Setting up Python Virtual Environment ---"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created."
else
    echo "Virtual environment already exists."
fi

# Install requirements
./venv/bin/pip install -r requirements.txt

# 3. Setup Systemd Service
echo "--- Configuring Systemd Service ---"
SERVICE_FILE="/etc/systemd/system/publishing_lab.service"

# Replace placeholders in the template
sed -e "s|USER_PLACEHOLDER|$CURRENT_USER|g" \
    -e "s|PROJECT_ROOT_PLACEHOLDER|$PROJECT_ROOT|g" \
    deploy/publishing_lab.service.template > publishing_lab.service.generated

# Move to systemd directory
sudo mv publishing_lab.service.generated $SERVICE_FILE

# Reload daemon and start service
sudo systemctl daemon-reload
sudo systemctl enable publishing_lab
sudo systemctl restart publishing_lab

echo "Systemd service configured and started."

# 4. Setup Nginx
echo "--- Configuring Nginx ---"
# Ask for domain or use IP
read -p "Enter your Domain Name or IP Address: " DOMAIN_NAME

NGINX_CONFIG="/etc/nginx/sites-available/publishing_lab"

# Replace placeholders
sed "s|YOUR_DOMAIN_OR_IP|$DOMAIN_NAME|g" deploy/nginx.conf.template > publishing_lab.nginx.generated

sudo mv publishing_lab.nginx.generated $NGINX_CONFIG

# Enable site
if [ ! -f "/etc/nginx/sites-enabled/publishing_lab" ]; then
    sudo ln -s $NGINX_CONFIG /etc/nginx/sites-enabled/
fi

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx

echo "Nginx configured."

echo "=== Deployment Complete! ==="
echo "Please ensure your .env file is created in $PROJECT_ROOT with the correct secrets."
