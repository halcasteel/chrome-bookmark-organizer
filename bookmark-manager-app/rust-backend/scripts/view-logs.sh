#!/bin/bash

# Get the parent directory (RUST-ACTIX-MIGRATION)
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Find latest log file
LATEST_LOG=$(ls -t logs/*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
    echo -e "${RED}No log files found in logs/ directory${NC}"
    exit 1
fi

echo -e "${CYAN}Viewing: $LATEST_LOG${NC}"
echo -e "${YELLOW}Commands:${NC}"
echo -e "  /auth     - Filter auth service logs"
echo -e "  /gateway  - Filter gateway logs"
echo -e "  /error    - Show only errors"
echo -e "  /warn     - Show warnings and errors"
echo -e "  q         - Quit"
echo ""

# Function to colorize logs based on service
colorize_logs() {
    while IFS= read -r line; do
        case "$line" in
            *"[AUTH]"*)    echo -e "${BLUE}${line}${NC}" ;;
            *"[GATEWAY]"*) echo -e "${CYAN}${line}${NC}" ;;
            *"[BOOKS]"*)   echo -e "${GREEN}${line}${NC}" ;;
            *"[IMPORT]"*)  echo -e "${YELLOW}${line}${NC}" ;;
            *"[SEARCH]"*)  echo -e "${PURPLE}${line}${NC}" ;;
            *"[BUILD]"*)   echo -e "${YELLOW}${line}${NC}" ;;
            *"[HEALTH]"*)  echo -e "${GREEN}${line}${NC}" ;;
            *"[SYSTEM]"*)  echo -e "${CYAN}${line}${NC}" ;;
            *"ERROR"*)     echo -e "${RED}${line}${NC}" ;;
            *"WARN"*)      echo -e "${YELLOW}${line}${NC}" ;;
            *)             echo "$line" ;;
        esac
    done
}

# Interactive mode
if [ "$1" == "-f" ] || [ "$1" == "--follow" ]; then
    tail -f "$LATEST_LOG" | colorize_logs
elif [ "$1" == "-e" ] || [ "$1" == "--errors" ]; then
    grep -E "(ERROR|WARN)" "$LATEST_LOG" | colorize_logs
elif [ "$1" == "-s" ] || [ "$1" == "--service" ]; then
    if [ -z "$2" ]; then
        echo -e "${RED}Please specify a service name${NC}"
        exit 1
    fi
    grep -i "\[$2\]" "$LATEST_LOG" | colorize_logs
else
    # Show last 100 lines with colors
    tail -100 "$LATEST_LOG" | colorize_logs
    
    echo ""
    echo -e "${CYAN}Options:${NC}"
    echo "  -f, --follow          Follow log in real-time"
    echo "  -e, --errors          Show only errors and warnings"
    echo "  -s, --service NAME    Filter by service name"
fi