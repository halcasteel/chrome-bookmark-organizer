#!/bin/bash
# Install and configure Vector for unified logging

set -e

echo "Installing Vector for unified logging..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        curl -1sLf 'https://repositories.timber.io/public/vector/cfg/setup/bash.deb.sh' | sudo -E bash
        sudo apt-get install vector
    elif command -v yum &> /dev/null; then
        # RHEL/CentOS
        curl -1sLf 'https://repositories.timber.io/public/vector/cfg/setup/bash.rpm.sh' | sudo -E bash
        sudo yum install vector
    else
        # Generic Linux - download binary
        curl -L https://github.com/vectordotdev/vector/releases/download/v0.34.0/vector-0.34.0-x86_64-unknown-linux-gnu.tar.gz -o vector.tar.gz
        tar xzf vector.tar.gz
        sudo mv vector-0.34.0-x86_64-unknown-linux-gnu/bin/vector /usr/local/bin/
        rm -rf vector.tar.gz vector-0.34.0-x86_64-unknown-linux-gnu
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &> /dev/null; then
        brew tap vectordotdev/brew
        brew install vector
    else
        echo "Please install Homebrew first: https://brew.sh"
        exit 1
    fi
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

# Create log directories
mkdir -p logs/structured
touch logs/unified.log

# Create Vector service file (for systemd systems)
if command -v systemctl &> /dev/null; then
    sudo tee /etc/systemd/system/vector-bookmark.service > /dev/null <<EOF
[Unit]
Description=Vector for Bookmark Manager
After=network.target
Documentation=https://vector.dev

[Service]
Type=simple
ExecStart=/usr/local/bin/vector --config $(pwd)/vector.toml
Restart=on-failure
WorkingDirectory=$(pwd)
User=$USER

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    echo "Vector service created. Start with: sudo systemctl start vector-bookmark"
fi

echo "Vector installation complete!"
echo ""
echo "To run Vector:"
echo "  vector --config vector.toml"
echo ""
echo "Or as a service:"
echo "  sudo systemctl start vector-bookmark"
echo "  sudo systemctl enable vector-bookmark  # To start on boot"