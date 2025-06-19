#!/bin/bash

# Database management tools

# Get the parent directory
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Database configuration
DB_HOST="localhost"
DB_PORT="5434"
DB_NAME="bookmarks"
DB_USER="postgres"
DB_PASS="postgres"
DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Database Management Tools${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Function to check database connection
check_db_connection() {
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" &>/dev/null
    return $?
}

# Function to run SQL command
run_sql() {
    local sql=$1
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$sql"
}

# Function to run SQL file
run_sql_file() {
    local file=$1
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$file"
}

# Check database connection
echo -e "${CYAN}Checking database connection...${NC}"
if check_db_connection; then
    echo -e "${GREEN}✓ Connected to PostgreSQL${NC}"
else
    echo -e "${RED}✗ Cannot connect to PostgreSQL on port $DB_PORT${NC}"
    echo -e "${YELLOW}Make sure PostgreSQL is running:${NC}"
    echo -e "${CYAN}cd ~/BOOKMARKS/bookmark-manager-app && docker-compose up -d postgres${NC}"
    exit 1
fi

# Menu
while true; do
    echo ""
    echo -e "${CYAN}Select an option:${NC}"
    echo "1) Run migrations"
    echo "2) Rollback migrations"
    echo "3) View database statistics"
    echo "4) Create backup"
    echo "5) Restore from backup"
    echo "6) Reset database (WARNING: Deletes all data)"
    echo "7) View table sizes"
    echo "8) Check indexes"
    echo "9) Analyze query performance"
    echo "10) Export data"
    echo "0) Exit"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1)
            # Run migrations
            echo -e "\n${CYAN}Running migrations...${NC}"
            
            # Check for sqlx-cli
            if ! command -v sqlx &> /dev/null; then
                echo -e "${YELLOW}sqlx-cli not found. Using SQL files directly...${NC}"
                
                # Run migrations manually
                for service in auth bookmarks; do
                    migration_dir="services/$service/migrations"
                    if [ -d "$migration_dir" ]; then
                        echo -e "\n${CYAN}Running migrations for $service...${NC}"
                        for migration in $migration_dir/*.sql; do
                            if [ -f "$migration" ]; then
                                echo -e "${YELLOW}Applying: $(basename $migration)${NC}"
                                run_sql_file "$migration"
                            fi
                        done
                    fi
                done
            else
                # Use sqlx migrate
                export DATABASE_URL
                for service in auth bookmarks; do
                    if [ -d "services/$service/migrations" ]; then
                        echo -e "\n${CYAN}Running migrations for $service...${NC}"
                        (cd "services/$service" && sqlx migrate run)
                    fi
                done
            fi
            ;;
        
        2)
            # Rollback migrations
            echo -e "\n${CYAN}Rolling back migrations...${NC}"
            if command -v sqlx &> /dev/null; then
                export DATABASE_URL
                for service in auth bookmarks; do
                    if [ -d "services/$service/migrations" ]; then
                        echo -e "\n${CYAN}Rolling back $service...${NC}"
                        (cd "services/$service" && sqlx migrate revert)
                    fi
                done
            else
                echo -e "${RED}sqlx-cli is required for rollback${NC}"
            fi
            ;;
        
        3)
            # View database statistics
            echo -e "\n${CYAN}Database Statistics${NC}"
            run_sql "SELECT 
                schemaname,
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
                n_live_tup AS row_count
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
            ;;
        
        4)
            # Create backup
            echo -e "\n${CYAN}Creating database backup...${NC}"
            mkdir -p backups
            timestamp=$(date +%Y%m%d_%H%M%S)
            backup_file="backups/backup_${timestamp}.sql"
            
            PGPASSWORD=$DB_PASS pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME > "$backup_file"
            
            if [ -f "$backup_file" ]; then
                size=$(du -h "$backup_file" | cut -f1)
                echo -e "${GREEN}✓ Backup created: $backup_file ($size)${NC}"
                
                # Compress backup
                gzip "$backup_file"
                echo -e "${GREEN}✓ Compressed to ${backup_file}.gz${NC}"
            else
                echo -e "${RED}✗ Backup failed${NC}"
            fi
            ;;
        
        5)
            # Restore from backup
            echo -e "\n${CYAN}Available backups:${NC}"
            ls -lh backups/*.sql* 2>/dev/null || echo "No backups found"
            
            echo ""
            read -p "Enter backup filename (or press Enter to cancel): " backup_file
            
            if [ ! -z "$backup_file" ] && [ -f "$backup_file" ]; then
                echo -e "${RED}${BOLD}WARNING: This will overwrite the current database!${NC}"
                read -p "Are you sure? (yes/no): " confirm
                
                if [ "$confirm" = "yes" ]; then
                    # Handle compressed files
                    if [[ "$backup_file" == *.gz ]]; then
                        echo -e "${CYAN}Decompressing backup...${NC}"
                        gunzip -c "$backup_file" | PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
                    else
                        PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME < "$backup_file"
                    fi
                    echo -e "${GREEN}✓ Database restored${NC}"
                fi
            fi
            ;;
        
        6)
            # Reset database
            echo -e "\n${RED}${BOLD}WARNING: This will delete ALL data!${NC}"
            echo -e "${RED}Type 'RESET DATABASE' to confirm:${NC}"
            read confirm
            
            if [ "$confirm" = "RESET DATABASE" ]; then
                echo -e "${YELLOW}Resetting database...${NC}"
                
                # Drop and recreate database
                PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
                PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
                
                echo -e "${GREEN}✓ Database reset complete${NC}"
                echo -e "${YELLOW}Run migrations to recreate tables${NC}"
            else
                echo -e "${GREEN}Database reset cancelled${NC}"
            fi
            ;;
        
        7)
            # View table sizes
            echo -e "\n${CYAN}Table Sizes${NC}"
            run_sql "SELECT
                tablename,
                pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS total_size,
                pg_size_pretty(pg_relation_size(tablename::regclass)) AS table_size,
                pg_size_pretty(pg_indexes_size(tablename::regclass)) AS indexes_size
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(tablename::regclass) DESC;"
            ;;
        
        8)
            # Check indexes
            echo -e "\n${CYAN}Database Indexes${NC}"
            run_sql "SELECT
                schemaname,
                tablename,
                indexname,
                pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
            FROM pg_stat_user_indexes
            ORDER BY pg_relation_size(indexrelid) DESC;"
            ;;
        
        9)
            # Analyze query performance
            echo -e "\n${CYAN}Slow Queries (if pg_stat_statements is enabled)${NC}"
            run_sql "SELECT
                calls,
                total_exec_time::numeric(10,2) AS total_ms,
                mean_exec_time::numeric(10,2) AS mean_ms,
                query
            FROM pg_stat_statements
            WHERE query NOT LIKE '%pg_stat_statements%'
            ORDER BY mean_exec_time DESC
            LIMIT 10;" 2>/dev/null || echo -e "${YELLOW}pg_stat_statements extension not enabled${NC}"
            ;;
        
        10)
            # Export data
            echo -e "\n${CYAN}Export Data${NC}"
            echo "1) Export users to CSV"
            echo "2) Export bookmarks to JSON"
            echo "3) Custom export"
            read -p "Select option: " export_choice
            
            mkdir -p exports
            timestamp=$(date +%Y%m%d_%H%M%S)
            
            case $export_choice in
                1)
                    export_file="exports/users_${timestamp}.csv"
                    run_sql "\COPY (SELECT * FROM users) TO '$PWD/$export_file' WITH CSV HEADER;"
                    echo -e "${GREEN}✓ Exported to $export_file${NC}"
                    ;;
                2)
                    export_file="exports/bookmarks_${timestamp}.json"
                    run_sql "\COPY (SELECT row_to_json(b) FROM bookmarks b) TO '$PWD/$export_file';"
                    echo -e "${GREEN}✓ Exported to $export_file${NC}"
                    ;;
                3)
                    read -p "Enter SQL query: " query
                    read -p "Enter filename: " filename
                    export_file="exports/${filename}_${timestamp}"
                    run_sql "\COPY ($query) TO '$PWD/$export_file' WITH CSV HEADER;"
                    echo -e "${GREEN}✓ Exported to $export_file${NC}"
                    ;;
            esac
            ;;
        
        0)
            echo -e "${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
done