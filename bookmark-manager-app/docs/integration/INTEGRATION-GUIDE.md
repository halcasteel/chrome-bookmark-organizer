# Claude Core Prompts Integration Guide

## 🎯 Overview

This project uses the CLAUDE-CODE-CORE-MASTER-PROMPTS as a git submodule to provide powerful AI automation commands. The submodule contains a comprehensive library of prompts that enable Claude to perform complex development tasks autonomously.

## 📁 Structure

```
bookmark-manager-app/
├── CLAUDE-CODE-CORE-MASTER-PROMPTS/    # Git submodule
│   ├── prompts/                         # Organized prompt library
│   │   ├── 01_META_COGNITIVE/          # Meta-cognitive prompts
│   │   ├── 02_RESEARCH_ANALYSIS/       # Research & analysis
│   │   ├── 03_EXPLANATION_EDUCATION/   # Educational prompts
│   │   └── ...                         # 12 categories total
│   ├── 1-2-3-CLAUDE-COMMAND-PALETTE.md # Quick reference guide
│   └── [Command]-PROMPT.json           # Individual command definitions
├── setup-claude-prompts.sh              # Management script
└── CLAUDE.md                           # Project-specific Claude context
```

## 🚀 Quick Start

### Initial Setup
```bash
# Run the setup script
./setup-claude-prompts.sh setup

# This will:
# 1. Initialize the git submodule
# 2. Update CLAUDE.md with prompt references
# 3. List all available commands
```

### Daily Usage
```bash
# Check status
./setup-claude-prompts.sh status

# Update to latest prompts
./setup-claude-prompts.sh update

# List available commands
./setup-claude-prompts.sh list
```

## 📋 Available Commands

The submodule provides these automation commands:

| Command | Purpose |
|---------|---------|
| `#FIX:` | Diagnose and fix issues automatically |
| `#REVIEW` | Comprehensive code review |
| `#DEBUG` | Interactive debugging assistant |
| `#SHIP` | Automated deployment pipeline |
| `#MONITOR` | Real-time system monitoring |
| `#PERF` | Performance optimization |
| `#MIGRATE` | Zero-downtime migrations |
| `#REFACTOR` | Intelligent code refactoring |
| `#LEARN` | AI-powered learning system |
| `#SYNC` | Multi-environment synchronization |
| `#SECURE` | Security analysis and hardening |
| `#ARCHITECT` | System architecture design |
| `#CHECKPOINT` | Create comprehensive checkpoints |

## 🔧 Management Script

The `setup-claude-prompts.sh` script provides these commands:

```bash
./setup-claude-prompts.sh [command] [options]

Commands:
  init      Initialize the Claude prompts submodule
  update    Update to the latest version
  status    Check current status and version
  list      List available Claude commands
  pin       Pin to specific version (e.g., pin v1.0.0)
  setup     Full setup (init + configure + list)
  help      Show help message
```

## 🔄 Version Management

### Use Latest Version
```bash
./setup-claude-prompts.sh update
```

### Pin to Specific Version
```bash
# Pin to a tagged version
./setup-claude-prompts.sh pin v1.0.0

# Pin to a specific commit
./setup-claude-prompts.sh pin abc123
```

## 👥 Team Collaboration

When team members clone this repository:

```bash
# Clone with submodules
git clone --recursive [repository-url]

# Or if already cloned
git submodule update --init --recursive

# Then run setup
./setup-claude-prompts.sh setup
```

## 🔍 How It Works

1. **Git Submodule**: The prompts are maintained in a separate repository
2. **Version Control**: Each project can use a specific version of prompts
3. **Updates**: Controlled updates ensure stability
4. **Isolation**: Changes to prompts don't affect the main project history

## 📝 Using Commands with Claude

Simply include any command in your message to Claude:

```
#FIX: authentication error in login

#REVIEW --security-focus

#SHIP production

#ARCHITECT design microservices
```

Claude will recognize these commands and execute the appropriate workflows defined in the JSON prompt files.

## 🆙 Updating the Prompts

To contribute improvements to the prompts:

1. Fork https://github.com/AZ1-ai/CLAUDE-CODE-CORE-MASTER-PROMPTS
2. Make your changes
3. Submit a pull request
4. Once merged, update this project: `./setup-claude-prompts.sh update`

## ⚠️ Important Notes

- The submodule is tracked at a specific commit
- Updates are explicit and controlled
- Each project can use different versions
- Changes to prompts don't affect your project's git history

## 🔗 Resources

- **Prompts Repository**: https://github.com/AZ1-ai/CLAUDE-CODE-CORE-MASTER-PROMPTS
- **Command Reference**: `CLAUDE-CODE-CORE-MASTER-PROMPTS/1-2-3-CLAUDE-COMMAND-PALETTE.md`
- **Prompt Library**: `CLAUDE-CODE-CORE-MASTER-PROMPTS/prompts/`

## 🎉 Benefits

1. **Consistency**: Same commands across all projects
2. **Maintainability**: Centralized prompt updates
3. **Version Control**: Track which prompt versions work with your code
4. **Collaboration**: Team members get the same AI capabilities
5. **Evolution**: Prompts improve over time for all projects