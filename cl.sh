# Download the RSA 4096 key
wget https://webmin.com/jcameron-key.asc

# Verify the key fingerprint (optional but recommended)
gpg --show-keys jcameron-key.asc

# Convert and place in trusted keys
gpg --dearmor jcameron-key.asc
sudo mv jcameron-key.gpg /usr/share/keyrings/webmin-archive-keyring.gpg

# Add repository using signed-by
echo "deb [signed-by=/usr/share/keyrings/webmin-archive-keyring.gpg] https://download.webmin.com/download/repository sarge contrib" | sudo tee /etc/apt/sources.list.d/webmin.list

# Update and install
sudo apt update
sudo apt install webmin -y