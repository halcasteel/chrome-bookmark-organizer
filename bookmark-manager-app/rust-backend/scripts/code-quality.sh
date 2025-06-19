#!/bin/bash

# Code quality and analysis tools

# Get the parent directory
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Code Quality & Analysis Tools${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Function to check and install tool
check_tool() {
    local tool=$1
    local install_cmd=$2
    
    if command -v $tool &> /dev/null; then
        echo -e "${GREEN}✓ $tool is installed${NC}"
        return 0
    else
        echo -e "${YELLOW}✗ $tool is not installed${NC}"
        if [ ! -z "$install_cmd" ]; then
            echo -e "  Install with: ${CYAN}$install_cmd${NC}"
        fi
        return 1
    fi
}

# Check tools
echo -e "${CYAN}Checking code quality tools...${NC}"
check_tool "cargo-clippy" "rustup component add clippy"
check_tool "cargo-fmt" "rustup component add rustfmt"
check_tool "cargo-audit" "cargo install cargo-audit"
check_tool "cargo-outdated" "cargo install cargo-outdated"
check_tool "cargo-udeps" "cargo install cargo-udeps --locked"
check_tool "tokei" "cargo install tokei"

echo ""

# Menu
while true; do
    echo -e "${CYAN}Select analysis:${NC}"
    echo "1) Run Clippy (linting)"
    echo "2) Check formatting"
    echo "3) Security audit"
    echo "4) Check outdated dependencies"
    echo "5) Find unused dependencies"
    echo "6) Code statistics"
    echo "7) Full quality check"
    echo "8) Generate documentation"
    echo "0) Exit"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1)
            # Clippy
            echo -e "\n${CYAN}Running Clippy...${NC}"
            cargo clippy --all-features -- -D warnings
            
            if [ $? -eq 0 ]; then
                echo -e "\n${GREEN}✓ No linting issues found${NC}"
            else
                echo -e "\n${RED}✗ Linting issues found${NC}"
            fi
            ;;
        
        2)
            # Format check
            echo -e "\n${CYAN}Checking code formatting...${NC}"
            cargo fmt --all -- --check
            
            if [ $? -eq 0 ]; then
                echo -e "\n${GREEN}✓ Code is properly formatted${NC}"
            else
                echo -e "\n${YELLOW}Code needs formatting${NC}"
                read -p "Format code now? (y/N): " format_now
                if [ "$format_now" = "y" ]; then
                    cargo fmt --all
                    echo -e "${GREEN}✓ Code formatted${NC}"
                fi
            fi
            ;;
        
        3)
            # Security audit
            echo -e "\n${CYAN}Running security audit...${NC}"
            if command -v cargo-audit &> /dev/null; then
                cargo audit
            else
                echo -e "${RED}cargo-audit not installed${NC}"
            fi
            ;;
        
        4)
            # Outdated dependencies
            echo -e "\n${CYAN}Checking for outdated dependencies...${NC}"
            if command -v cargo-outdated &> /dev/null; then
                cargo outdated
            else
                echo -e "${RED}cargo-outdated not installed${NC}"
            fi
            ;;
        
        5)
            # Unused dependencies
            echo -e "\n${CYAN}Finding unused dependencies...${NC}"
            echo -e "${YELLOW}Note: This requires nightly Rust${NC}"
            if command -v cargo-udeps &> /dev/null; then
                cargo +nightly udeps --all-targets
            else
                echo -e "${RED}cargo-udeps not installed${NC}"
            fi
            ;;
        
        6)
            # Code statistics
            echo -e "\n${CYAN}Code Statistics${NC}"
            if command -v tokei &> /dev/null; then
                tokei
            else
                # Fallback to basic stats
                echo -e "\n${YELLOW}Using basic statistics (install tokei for detailed stats)${NC}"
                echo -e "\n${CYAN}Line counts:${NC}"
                find . -name "*.rs" -type f | xargs wc -l | sort -n
                
                echo -e "\n${CYAN}File counts:${NC}"
                echo "Rust files: $(find . -name "*.rs" -type f | wc -l)"
                echo "Total files: $(find . -type f -not -path "./target/*" -not -path "./.git/*" | wc -l)"
            fi
            ;;
        
        7)
            # Full quality check
            echo -e "\n${PURPLE}Running full quality check...${NC}"
            
            # Create report
            report_file="quality-report-$(date +%Y%m%d_%H%M%S).txt"
            echo "Code Quality Report - $(date)" > $report_file
            echo "================================" >> $report_file
            
            # Tests
            echo -e "\n${CYAN}1. Running tests...${NC}"
            cargo test --all 2>&1 | tee -a $report_file
            test_result=$?
            
            # Clippy
            echo -e "\n${CYAN}2. Running Clippy...${NC}"
            cargo clippy --all-features -- -D warnings 2>&1 | tee -a $report_file
            clippy_result=$?
            
            # Format
            echo -e "\n${CYAN}3. Checking formatting...${NC}"
            cargo fmt --all -- --check 2>&1 | tee -a $report_file
            fmt_result=$?
            
            # Summary
            echo -e "\n${PURPLE}Summary:${NC}"
            echo -e "Tests:      $([ $test_result -eq 0 ] && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}")"
            echo -e "Clippy:     $([ $clippy_result -eq 0 ] && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}")"
            echo -e "Formatting: $([ $fmt_result -eq 0 ] && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}")"
            
            echo -e "\n${CYAN}Report saved to: $report_file${NC}"
            ;;
        
        8)
            # Generate documentation
            echo -e "\n${CYAN}Generating documentation...${NC}"
            cargo doc --all-features --no-deps
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Documentation generated${NC}"
                echo -e "${CYAN}View at: file://$PWD/target/doc/index.html${NC}"
                
                read -p "Open in browser? (y/N): " open_docs
                if [ "$open_docs" = "y" ]; then
                    xdg-open "file://$PWD/target/doc/index.html" 2>/dev/null || \
                    open "file://$PWD/target/doc/index.html" 2>/dev/null || \
                    echo -e "${YELLOW}Please open manually: file://$PWD/target/doc/index.html${NC}"
                fi
            fi
            ;;
        
        0)
            echo -e "${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
    echo ""
done