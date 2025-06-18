#!/bin/bash

# CLAUDE-CODE-CORE-MASTER-PROMPTS Setup Script
# This script manages the Claude AI automation prompts submodule

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Header
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     CLAUDE-CODE-CORE-MASTER-PROMPTS Setup & Management${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo

# Function to check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "This script must be run from within a git repository!"
        exit 1
    fi
}

# Function to initialize submodule
init_submodule() {
    print_status "Initializing Claude Core Prompts submodule..."
    
    if [ -f .gitmodules ] && grep -q "CLAUDE-CODE-CORE-MASTER-PROMPTS" .gitmodules; then
        print_status "Submodule already configured in .gitmodules"
    else
        print_status "Adding submodule..."
        git submodule add https://github.com/AZ1-ai/CLAUDE-CODE-CORE-MASTER-PROMPTS.git || {
            print_warning "Submodule might already exist. Continuing..."
        }
    fi
    
    print_status "Initializing and updating submodule..."
    git submodule update --init --recursive
    
    print_success "Submodule initialized successfully!"
}

# Function to update submodule to latest
update_submodule() {
    print_status "Updating Claude Core Prompts to latest version..."
    
    cd CLAUDE-CODE-CORE-MASTER-PROMPTS
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    local current_commit=$(git rev-parse --short HEAD)
    
    print_status "Current version: $current_branch @ $current_commit"
    
    git fetch origin
    git checkout main
    git pull origin main
    
    local new_commit=$(git rev-parse --short HEAD)
    cd ..
    
    if [ "$current_commit" != "$new_commit" ]; then
        print_success "Updated from $current_commit to $new_commit"
        print_status "Committing submodule update..."
        git add CLAUDE-CODE-CORE-MASTER-PROMPTS
        git commit -m "chore: Update CLAUDE-CODE-CORE-MASTER-PROMPTS to $new_commit"
        print_success "Update committed!"
    else
        print_status "Already at latest version"
    fi
}

# Function to check submodule status
check_status() {
    print_status "Checking Claude Core Prompts status..."
    
    if [ ! -d "CLAUDE-CODE-CORE-MASTER-PROMPTS/.git" ]; then
        print_error "Submodule not initialized! Run with 'init' option."
        exit 1
    fi
    
    cd CLAUDE-CODE-CORE-MASTER-PROMPTS
    local branch=$(git rev-parse --abbrev-ref HEAD)
    local commit=$(git rev-parse --short HEAD)
    local status=$(git status --porcelain)
    
    echo
    echo "  Repository: https://github.com/AZ1-ai/CLAUDE-CODE-CORE-MASTER-PROMPTS"
    echo "  Branch: $branch"
    echo "  Commit: $commit"
    echo "  Status: $([ -z "$status" ] && echo "Clean" || echo "Modified")"
    
    if [ ! -z "$status" ]; then
        print_warning "Submodule has local changes:"
        git status --short
    fi
    
    # Check if update available
    git fetch origin --quiet
    local LOCAL=$(git rev-parse @)
    local REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
    
    if [ "$LOCAL" != "$REMOTE" ] && [ ! -z "$REMOTE" ]; then
        print_warning "Updates available! Run with 'update' to get latest changes."
    else
        print_success "You're using the latest version!"
    fi
    
    cd ..
}

# Function to list available commands
list_commands() {
    print_status "Checking available Claude commands..."
    
    if [ ! -d "CLAUDE-CODE-CORE-MASTER-PROMPTS" ]; then
        print_error "Submodule not found! Run with 'init' first."
        exit 1
    fi
    
    echo
    echo "Available Claude Commands:"
    echo "─────────────────────────"
    
    # Find all *-PROMPT.json files
    find CLAUDE-CODE-CORE-MASTER-PROMPTS -name "*-PROMPT.json" -type f | while read -r file; do
        basename=$(basename "$file" .json)
        command=$(echo $basename | sed 's/-PROMPT//' | sed 's/^/#/')
        
        # Try to extract description from JSON
        if command -v jq > /dev/null 2>&1; then
            description=$(jq -r '.description // empty' "$file" 2>/dev/null || echo "")
            [ ! -z "$description" ] && echo "  $command - $description" || echo "  $command"
        else
            echo "  $command"
        fi
    done
    
    echo
    print_status "For detailed usage, see: CLAUDE-CODE-CORE-MASTER-PROMPTS/1-2-3-CLAUDE-COMMAND-PALETTE.md"
}

# Function to create local CLAUDE.md with prompt references
create_claude_md() {
    print_status "Creating/Updating CLAUDE.md with prompt references..."
    
    local claude_md="CLAUDE.md"
    local temp_file=$(mktemp)
    
    # Check if CLAUDE.md exists and has existing content
    if [ -f "$claude_md" ]; then
        # Remove old Claude Commands section if it exists
        sed '/^## 🤖 Claude Command Palette/,/^##[^#]/d' "$claude_md" | sed '$ d' > "$temp_file"
    else
        # Create new file with header
        cat > "$temp_file" << 'EOF'
# CLAUDE.md - AI Assistant Context

This file provides context to Claude AI when working on this project.

EOF
    fi
    
    # Add Claude Commands section
    cat >> "$temp_file" << 'EOF'

## 🤖 Claude Command Palette

This project includes the CLAUDE-CODE-CORE-MASTER-PROMPTS submodule, providing powerful automation commands:

### Quick Reference
See `CLAUDE-CODE-CORE-MASTER-PROMPTS/1-2-3-CLAUDE-COMMAND-PALETTE.md` for complete documentation.

### Available Commands
- `#FIX:` - Diagnose and fix issues automatically
- `#REVIEW` - Comprehensive code review with AI
- `#DEBUG` - Interactive debugging assistant
- `#SHIP` - Complete deployment pipeline
- `#MONITOR` - Real-time system monitoring
- `#PERF` - Performance analysis and optimization
- `#MIGRATE` - Zero-downtime migrations
- `#REFACTOR` - Intelligent code refactoring
- `#LEARN` - AI learns from your codebase
- `#SYNC` - Multi-environment synchronization
- `#SECURE` - Security scanning and hardening
- `#ARCHITECT` - System design and analysis

### Using Commands
Simply type any command in your message to Claude. For example:
- `#FIX: authentication error in login`
- `#REVIEW --security-focus`
- `#SHIP production`

The commands are defined in JSON files within the `CLAUDE-CODE-CORE-MASTER-PROMPTS/` directory.

EOF
    
    # Add any remaining content
    if [ -f "$claude_md" ]; then
        # Get content after Claude Commands section
        awk '/^##[^#]/ && !/^## 🤖 Claude Command Palette/ {p=1} p' "$claude_md" >> "$temp_file" 2>/dev/null || true
    fi
    
    mv "$temp_file" "$claude_md"
    print_success "CLAUDE.md updated with prompt references!"
}

# Function to copy prototype CLAUDE.md for new projects
copy_prototype() {
    print_status "Setting up CLAUDE.md from prototype template..."
    
    # Check if submodule exists
    if [ ! -d "CLAUDE-CODE-CORE-MASTER-PROMPTS" ]; then
        print_warning "Submodule not initialized. Running init first..."
        init_submodule
    fi
    
    # Check if prototype exists
    local prototype="CLAUDE-CODE-CORE-MASTER-PROMPTS/CLAUDE-PROTOTYPE-INITIAL.md"
    if [ ! -f "$prototype" ]; then
        print_error "Prototype file not found: $prototype"
        print_status "Updating submodule to get latest files..."
        update_submodule
        
        if [ ! -f "$prototype" ]; then
            print_error "Prototype file still not found after update!"
            exit 1
        fi
    fi
    
    # Check if CLAUDE.md already exists
    if [ -f "CLAUDE.md" ]; then
        print_warning "CLAUDE.md already exists!"
        read -p "Do you want to backup existing CLAUDE.md? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            local backup="CLAUDE.md.backup.$(date +%Y%m%d_%H%M%S)"
            cp CLAUDE.md "$backup"
            print_success "Existing CLAUDE.md backed up to: $backup"
        else
            print_warning "Skipping CLAUDE.md creation - file already exists"
            return
        fi
    fi
    
    # Copy prototype
    cp "$prototype" CLAUDE.md
    
    # Replace placeholders with actual values
    local project_name=$(basename "$PWD")
    local current_date=$(date +"%Y-%m-%d")
    
    # Use sed to replace placeholders
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\[PROJECT_NAME\]/$project_name/g" CLAUDE.md
        sed -i '' "s/\[DATE\]/$current_date/g" CLAUDE.md
    else
        # Linux
        sed -i "s/\[PROJECT_NAME\]/$project_name/g" CLAUDE.md
        sed -i "s/\[DATE\]/$current_date/g" CLAUDE.md
    fi
    
    print_success "CLAUDE.md created from prototype template!"
    print_status "Project name set to: $project_name"
    print_status "Please edit CLAUDE.md to add your project-specific details"
    echo
    print_warning "Next steps:"
    echo "  1. Update project overview section in CLAUDE.md"
    echo "  2. Configure .claude/autonomous.yaml for your needs"
    echo "  3. Set your preferred autonomy level (currently: 1 - Assisted)"
    echo "  4. Run '$0 list' to see available commands"
}

# Function to pin to specific version
pin_version() {
    local version=$1
    
    if [ -z "$version" ]; then
        print_error "Please specify a version (e.g., 'v1.0.0' or a commit hash)"
        exit 1
    fi
    
    print_status "Pinning Claude Core Prompts to version: $version"
    
    cd CLAUDE-CODE-CORE-MASTER-PROMPTS
    git fetch origin --tags
    
    if git checkout "$version" 2>/dev/null; then
        local commit=$(git rev-parse --short HEAD)
        cd ..
        git add CLAUDE-CODE-CORE-MASTER-PROMPTS
        git commit -m "chore: Pin CLAUDE-CODE-CORE-MASTER-PROMPTS to $version ($commit)"
        print_success "Successfully pinned to version $version"
    else
        cd ..
        print_error "Version '$version' not found!"
        print_status "Available tags:"
        cd CLAUDE-CODE-CORE-MASTER-PROMPTS && git tag -l && cd ..
        exit 1
    fi
}

# Main script logic
check_git_repo

case "${1:-help}" in
    init)
        init_submodule
        create_claude_md
        list_commands
        ;;
    update)
        update_submodule
        ;;
    status)
        check_status
        ;;
    list)
        list_commands
        ;;
    pin)
        pin_version "$2"
        ;;
    prototype)
        copy_prototype
        ;;
    setup)
        init_submodule
        create_claude_md
        list_commands
        print_success "Full setup completed!"
        ;;
    new-project)
        # Complete setup for new project
        init_submodule
        copy_prototype
        list_commands
        print_success "New project setup completed!"
        ;;
    help|--help|-h)
        echo "Usage: $0 [command] [options]"
        echo
        echo "Commands:"
        echo "  init         Initialize the Claude prompts submodule"
        echo "  update       Update to the latest version"
        echo "  status       Check current status and version"
        echo "  list         List available Claude commands"
        echo "  pin          Pin to specific version (e.g., $0 pin v1.0.0)"
        echo "  prototype    Copy prototype CLAUDE.md template to project"
        echo "  new-project  Complete setup for new project (init + prototype)"
        echo "  setup        Full setup (init + configure + list)"
        echo "  help         Show this help message"
        echo
        echo "Examples:"
        echo "  $0 new-project          # First time setup for new project"
        echo "  $0 init                 # Initialize submodule only"
        echo "  $0 prototype            # Copy CLAUDE.md template"
        echo "  $0 update               # Get latest prompts"
        echo "  $0 pin v1.0.0          # Use specific version"
        echo "  $0 status              # Check current state"
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac