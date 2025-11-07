#!/usr/bin/env bash
set -euo pipefail

# install-cloudflared.sh
# Installs cloudflared from GitHub releases (Debian/Ubuntu .deb)
# Supports: amd64, arm64, arm (armv7)
# Run with: sudo ./install-cloudflared.sh

# Helper: print and exit
err() { echo "ERROR: $*" >&2; exit 1; }

# Ensure curl or wget exists
if command -v curl >/dev/null 2>&1; then
  DL_CMD="curl -fsSL -o"
elif command -v wget >/dev/null 2>&1; then
  DL_CMD="wget -qO"
else
  echo "curl or wget not found — installing curl..."
  apt-get update
  apt-get install -y curl
  DL_CMD="curl -fsSL -o"
fi

# Check running as root or via sudo
if [ "$(id -u)" -ne 0 ]; then
  echo "This script needs root. Re-run with sudo."
  exit 1
fi

# Check distro
if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "$ID" in
    ubuntu|debian|linuxmint) ;;
    *) echo "Warning: this script was written for Debian/Ubuntu. Continuing anyway." ;;
  esac
fi

# Detect architecture and map to cloudflared artifact
arch="$(dpkg --print-architecture 2>/dev/null || true)"
if [ -z "$arch" ]; then
  uname_m="$(uname -m)"
  case "$uname_m" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    armv7l|armv7) arch="arm" ;;
    *) err "Unsupported arch: $uname_m" ;;
  esac
fi

case "$arch" in
  amd64|arm64|arm) ;;
  *) err "Unsupported dpkg architecture: $arch" ;;
esac

deb="/tmp/cloudflared-linux-${arch}.deb"
url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb"

echo "Detected architecture: $arch"
echo "Downloading: $url"

# Download
$DL_CMD "$deb" "$url" || err "Download failed"

echo "Installing $deb ..."
# Install package; allow apt to fix dependencies if needed
if dpkg -i "$deb"; then
  echo "cloudflared package installed via dpkg."
else
  echo "dpkg reported missing deps — attempting to fix with apt."
  apt-get update
  apt-get -y -f install
fi

# Cleanup
rm -f "$deb"

# Verify
if command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared installed successfully:"
  cloudflared --version || true
else
  err "cloudflared binary not found after installation."
fi

echo "Done. To get started, try: cloudflared tunnel login"