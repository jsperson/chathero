#!/bin/bash

# ChatHero Installation Script
# This script installs all required dependencies for ChatHero

set -e  # Exit on any error

echo "================================================"
echo "ChatHero Installation Script"
echo "================================================"
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Exiting."
    exit 1
fi

echo "Detected OS: $OS"
echo ""

# Update package manager
echo "Updating package manager..."
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update
elif [ "$OS" = "alpine" ]; then
    apk update
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    yum update -y
else
    echo "Unsupported OS: $OS"
    exit 1
fi

# Install Git
echo ""
echo "Installing Git..."
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get install -y git curl
elif [ "$OS" = "alpine" ]; then
    apk add --no-cache git curl bash
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    yum install -y git curl
fi

# Check if Git is installed
if ! command -v git &> /dev/null; then
    echo "Git installation failed. Exiting."
    exit 1
fi

echo "Git installed: $(git --version)"

# Install Node.js and npm
echo ""
echo "Installing Node.js and npm..."

# Install Node.js 20.x (LTS)
if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    # Install Node.js from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
elif [ "$OS" = "alpine" ]; then
    apk add --no-cache nodejs npm
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    # Install Node.js from NodeSource
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
fi

# Verify Node.js installation
if ! command -v node &> /dev/null; then
    echo "Node.js installation failed. Exiting."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "npm installation failed. Exiting."
    exit 1
fi

echo "Node.js installed: $(node --version)"
echo "npm installed: $(npm --version)"

# Clone ChatHero repository
echo ""
echo "Cloning ChatHero repository..."

INSTALL_DIR="${INSTALL_DIR:-$HOME/chathero}"

if [ -d "$INSTALL_DIR" ]; then
    echo "Directory $INSTALL_DIR already exists."
    read -p "Do you want to remove it and clone fresh? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
    else
        echo "Using existing directory."
    fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
    git clone https://github.com/jsperson/chathero.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Install project dependencies
echo ""
echo "Installing ChatHero dependencies..."

if [ ! -f package.json ]; then
    echo "Error: package.json not found. Repository may not have cloned correctly."
    exit 1
fi

npm install

echo ""
echo "================================================"
echo "Installation Complete!"
echo "================================================"
echo ""
echo "ChatHero installed in: $INSTALL_DIR"
echo ""
echo "Next steps:"
echo "1. cd $INSTALL_DIR"
echo "2. Create .env file: cp .env.example .env"
echo "3. Edit .env and add your OpenAI API key"
echo "4. Run the app: npm run dev"
echo "5. Access at: http://localhost:3000"
echo ""
