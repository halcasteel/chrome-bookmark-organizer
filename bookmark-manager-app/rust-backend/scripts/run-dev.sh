#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the parent directory (RUST-ACTIX-MIGRATION)
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Add cargo to PATH if not already there
if ! command -v cargo &> /dev/null && [ -x "$HOME/.cargo/bin/cargo" ]; then
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Create logs directory
mkdir -p logs

# Log file with timestamp
LOG_FILE="logs/dev-$(date +%Y%m%d-%H%M%S).log"

# Function to log with timestamp and service name
log() {
    local service=$1
    local color=$2
    local message=$3
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S.%3N')
    echo -e "${color}[$timestamp] [$service]${NC} $message" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log "SYSTEM" "$RED" "Shutting down services..."
    pkill -P $$
    wait
    log "SYSTEM" "$RED" "All services stopped"
    exit 0
}

trap cleanup EXIT INT TERM

clear
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}    Rust + Actix Development Mode (Auto-Reload)${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if cargo-watch is installed
if ! command -v cargo-watch &> /dev/null; then
    log "SYSTEM" "$YELLOW" "Installing cargo-watch..."
    cargo install cargo-watch
fi

# Create tmux session for development
if command -v tmux &> /dev/null; then
    SESSION="rust-microservices"
    
    # Kill existing session
    tmux kill-session -t $SESSION 2>/dev/null
    
    # Create new session
    tmux new-session -d -s $SESSION -n "gateway"
    
    # Gateway window
    tmux send-keys -t $SESSION:0 "cd services/gateway" C-m
    tmux send-keys -t $SESSION:0 "cargo watch -x 'run' -w src" C-m
    
    # Auth service window
    tmux new-window -t $SESSION:1 -n "auth"
    tmux send-keys -t $SESSION:1 "cd services/auth" C-m
    tmux send-keys -t $SESSION:1 "cargo watch -x 'run' -w src" C-m
    
    # Bookmarks service window
    tmux new-window -t $SESSION:2 -n "bookmarks"
    tmux send-keys -t $SESSION:2 "cd services/bookmarks" C-m
    tmux send-keys -t $SESSION:2 "cargo watch -x 'run' -w src" C-m
    
    # Logs window
    tmux new-window -t $SESSION:3 -n "logs"
    tmux send-keys -t $SESSION:3 "tail -f $LOG_FILE | ccze -A" C-m
    
    echo -e "${GREEN}Development environment started in tmux!${NC}"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo -e "  Attach:     ${GREEN}tmux attach -t $SESSION${NC}"
    echo -e "  Detach:     ${GREEN}Ctrl+B, D${NC}"
    echo -e "  Switch:     ${GREEN}Ctrl+B, [0-3]${NC}"
    echo -e "  Kill:       ${GREEN}tmux kill-session -t $SESSION${NC}"
    
else
    # Fallback: Run in background with unified logging
    log "SYSTEM" "$YELLOW" "Running without tmux - using background processes"
    
    # Function to run service with cargo-watch
    run_watch() {
        local name=$1
        local path=$2
        local color=$3
        
        (
            cd "$path"
            cargo watch -x 'run' -w src 2>&1 | while IFS= read -r line; do
                log "$name" "$color" "$line"
            done
        ) &
    }
    
    run_watch "GATEWAY" "services/gateway" "$CYAN"
    run_watch "AUTH" "services/auth" "$BLUE"
    run_watch "BOOKS" "services/bookmarks" "$GREEN"
    run_watch "IMPORT" "services/import" "$YELLOW"
    run_watch "SEARCH" "services/search" "$PURPLE"
    
    echo -e "${GREEN}Services started with auto-reload!${NC}"
    echo -e "${CYAN}Watching log file:${NC} $LOG_FILE"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    
    # Follow the log file
    tail -f "$LOG_FILE"
fi