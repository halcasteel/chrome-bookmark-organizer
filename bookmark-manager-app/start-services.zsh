#!/usr/bin/env zsh
#
# Bookmark Manager Startup Script (Zsh)
# Manages PostgreSQL, Redis, and Rust microservices
#

# Enable extended globbing
setopt EXTENDED_GLOB
setopt NULL_GLOB

# Script directory
SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

# Colors
autoload -U colors && colors
RED=$fg[red]
GREEN=$fg[green]
YELLOW=$fg[yellow]
BLUE=$fg[blue]
MAGENTA=$fg[magenta]
CYAN=$fg[cyan]
WHITE=$fg[white]
BOLD=$bold_color
RESET=$reset_color

# Configuration
typeset -A CONFIG
CONFIG=(
    # PostgreSQL
    POSTGRES_PORT ${POSTGRES_PORT:-5434}
    POSTGRES_HOST "localhost"
    POSTGRES_DB ${POSTGRES_DB:-bookmark_manager}
    POSTGRES_USER ${POSTGRES_USER:-bookmarkuser}
    POSTGRES_PASSWORD ${POSTGRES_PASSWORD:-bookmarkpass}
    
    # Redis
    REDIS_PORT ${REDIS_PORT:-6382}
    REDIS_HOST "localhost"
    
    # Common environment
    JWT_SECRET ${JWT_SECRET:-"local-dev-jwt-secret-change-in-production"}
    RUST_LOG ${RUST_LOG:-info}
    RUST_BACKTRACE 1
    
    # Directories
    RUST_DIR "$SCRIPT_DIR/rust-migration"
    FRONTEND_DIR "$SCRIPT_DIR/frontend"
    LOGS_DIR "$SCRIPT_DIR/logs"
    DATABASE_DIR "$SCRIPT_DIR/database"
)

# Service definitions
typeset -A SERVICES
SERVICES=(
    auth "8001:auth-service:Auth Service"
    bookmarks "8002:bookmarks-service:Bookmarks Service"
    import "8003:import-service:Import Service"
    search "8004:search-service:Search Service"
    gateway "8000:gateway:API Gateway"
)

# Process tracking
typeset -A PIDS

# Timing
START_TIME=$(date +%s)

# ============================================================================
# Helper Functions
# ============================================================================

function print_section() {
    local title="$1"
    local line=$(printf '═%.0s' {1..70})
    echo "\n${CYAN}${line}${RESET}"
    echo "${CYAN}║ ${BOLD}${title}${CYAN}$(printf ' %.0s' {1..$((66 - ${#title}))}) ║${RESET}"
    echo "${CYAN}${line}${RESET}\n"
}

function log() {
    local level="$1"
    local message="$2"
    local details="$3"
    
    local timestamp=$(date +"%H:%M:%S")
    local elapsed=$(( $(date +%s) - START_TIME ))
    
    local level_color
    case "$level" in
        info) level_color=$CYAN ;;
        success) level_color=$GREEN ;;
        warn) level_color=$YELLOW ;;
        error) level_color=$RED ;;
        debug) level_color=$WHITE ;;
    esac
    
    printf "[%s +%4ds] %s[%7s]%s %s\n" \
        "$timestamp" "$elapsed" "$level_color" "${level:u}" "$RESET" "$message"
    
    if [[ -n "$details" ]]; then
        echo "$details" | while read -r line; do
            echo "                               ${WHITE}${line}${RESET}"
        done
    fi
}

function progress() {
    local message="$1"
    local current="$2"
    local total="$3"
    
    if [[ -n "$current" && -n "$total" && "$total" -gt 0 ]]; then
        local percentage=$(( (current * 100) / total ))
        local bar_length=30
        local filled=$(( (current * bar_length) / total ))
        local bar=$(printf '█%.0s' {1..$filled})$(printf '░%.0s' {1..$((bar_length - filled))})
        printf "\r  %s %3d%% - %s          " "$bar" "$percentage" "$message"
        [[ "$current" -eq "$total" ]] && echo
    else
        printf "\r  ⏳ %s...          " "$message"
    fi
}

function check_port() {
    local port="$1"
    local service="$2"
    
    if lsof -i ":$port" &>/dev/null; then
        return 1  # Port in use
    else
        return 0  # Port available
    fi
}

function check_command() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        log error "Required command not found: $cmd"
        return 1
    fi
    return 0
}

function cleanup() {
    echo
    print_section "Shutting down services..."
    
    # Kill Rust services
    for service pid in ${(kv)PIDS}; do
        if kill -0 "$pid" 2>/dev/null; then
            log info "Stopping $service (PID: $pid)"
            kill -TERM "$pid" 2>/dev/null
        fi
    done
    
    # Wait for processes to die
    sleep 2
    
    # Force kill if needed
    for service pid in ${(kv)PIDS}; do
        if kill -0 "$pid" 2>/dev/null; then
            log warn "Force killing $service"
            kill -KILL "$pid" 2>/dev/null
        fi
    done
    
    log info "Shutdown complete"
    exit 0
}

# Set up signal handlers
trap cleanup INT TERM

# ============================================================================
# Docker Container Management
# ============================================================================

function manage_docker_container() {
    local name="$1"
    local image="$2"
    local port_mapping="$3"
    shift 3
    local env_vars=("$@")
    
    local container_name="bookmark-$name"
    
    # Check if container exists
    if docker ps -a --format "{{.Names}}" | grep -q "^${container_name}$"; then
        if docker ps --format "{{.Names}}" | grep -q "^${container_name}$"; then
            log info "Container $container_name is already running"
            return 0
        else
            log info "Starting existing container $container_name..."
            docker start "$container_name" || return 1
            return 0
        fi
    fi
    
    # Create new container
    log info "Creating new container $container_name..."
    
    local docker_cmd=(docker run -d --name "$container_name" -p "$port_mapping")
    
    for env in $env_vars; do
        docker_cmd+=(-e "$env")
    done
    
    docker_cmd+=("$image")
    
    if "${docker_cmd[@]}"; then
        log success "Container $container_name created successfully"
        return 0
    else
        log error "Failed to create container $container_name"
        return 1
    fi
}

# ============================================================================
# Service Start Functions
# ============================================================================

function start_postgres() {
    print_section "PostgreSQL Database"
    
    if ! check_port "$CONFIG[POSTGRES_PORT]" "PostgreSQL"; then
        log info "PostgreSQL already running on port $CONFIG[POSTGRES_PORT]"
    else
        if ! manage_docker_container "postgres" \
            "pgvector/pgvector:pg16" \
            "$CONFIG[POSTGRES_PORT]:5432" \
            "POSTGRES_DB=$CONFIG[POSTGRES_DB]" \
            "POSTGRES_USER=$CONFIG[POSTGRES_USER]" \
            "POSTGRES_PASSWORD=$CONFIG[POSTGRES_PASSWORD]"; then
            return 1
        fi
        
        log info "Waiting for PostgreSQL to accept connections..."
        sleep 5
    fi
    
    # Verify connection
    export PGPASSWORD="$CONFIG[POSTGRES_PASSWORD]"
    
    for i in {1..30}; do
        progress "Checking PostgreSQL connection" "$i" 30
        if psql -h "$CONFIG[POSTGRES_HOST]" -p "$CONFIG[POSTGRES_PORT]" \
               -U "$CONFIG[POSTGRES_USER]" -d "$CONFIG[POSTGRES_DB]" \
               -c "SELECT 1" &>/dev/null; then
            log success "PostgreSQL connection verified"
            
            # Check pgvector extension
            local has_vector=$(psql -h "$CONFIG[POSTGRES_HOST]" -p "$CONFIG[POSTGRES_PORT]" \
                -U "$CONFIG[POSTGRES_USER]" -d "$CONFIG[POSTGRES_DB]" -t -c \
                "SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector'")
            
            if [[ "$has_vector" -eq 0 ]]; then
                log info "Installing pgvector extension..."
                psql -h "$CONFIG[POSTGRES_HOST]" -p "$CONFIG[POSTGRES_PORT]" \
                    -U "$CONFIG[POSTGRES_USER]" -d "$CONFIG[POSTGRES_DB]" \
                    -c "CREATE EXTENSION IF NOT EXISTS vector"
                log success "pgvector extension installed"
            else
                log success "pgvector extension already installed"
            fi
            
            unset PGPASSWORD
            return 0
        fi
        sleep 1
    done
    
    unset PGPASSWORD
    log error "PostgreSQL failed to start"
    return 1
}

function start_redis() {
    print_section "Redis Cache"
    
    if ! check_port "$CONFIG[REDIS_PORT]" "Redis"; then
        log info "Redis already running on port $CONFIG[REDIS_PORT]"
        return 0
    fi
    
    if ! manage_docker_container "redis" \
        "redis:alpine" \
        "$CONFIG[REDIS_PORT]:6379"; then
        return 1
    fi
    
    # Wait for Redis to be ready
    sleep 2
    
    # Verify connection
    for i in {1..10}; do
        progress "Checking Redis connection" "$i" 10
        if redis-cli -p "$CONFIG[REDIS_PORT]" ping &>/dev/null; then
            log success "Redis connection verified"
            return 0
        fi
        sleep 1
    done
    
    log error "Redis failed to start"
    return 1
}

function apply_migrations() {
    print_section "Database Migrations"
    
    local migration_files=($CONFIG[DATABASE_DIR]/*.sql(N))
    
    if [[ ${#migration_files} -eq 0 ]]; then
        log warn "No migration files found"
        return 0
    fi
    
    export PGPASSWORD="$CONFIG[POSTGRES_PASSWORD]"
    
    local count=0
    for migration in $migration_files; do
        ((count++))
        progress "Applying $(basename $migration)" "$count" "${#migration_files}"
        
        if psql -h "$CONFIG[POSTGRES_HOST]" -p "$CONFIG[POSTGRES_PORT]" \
               -U "$CONFIG[POSTGRES_USER]" -d "$CONFIG[POSTGRES_DB]" \
               -f "$migration" &>/dev/null; then
            :  # Success
        else
            # Check if it's a duplicate error
            local error=$(psql -h "$CONFIG[POSTGRES_HOST]" -p "$CONFIG[POSTGRES_PORT]" \
                -U "$CONFIG[POSTGRES_USER]" -d "$CONFIG[POSTGRES_DB]" \
                -f "$migration" 2>&1)
            
            if [[ "$error" =~ "already exists" ]]; then
                :  # Skip
            else
                log error "Failed to apply $(basename $migration)"
                echo "$error"
                unset PGPASSWORD
                return 1
            fi
        fi
    done
    
    unset PGPASSWORD
    log success "All migrations applied successfully"
    return 0
}

function build_rust_services() {
    print_section "Building Rust Services"
    
    if [[ ! -f "$CONFIG[RUST_DIR]/Cargo.toml" ]]; then
        log error "Rust project not found at $CONFIG[RUST_DIR]"
        return 1
    fi
    
    # Check if already built
    local needs_build=0
    for service_def in ${(v)SERVICES}; do
        local binary_name="${service_def#*:}"
        binary_name="${binary_name%:*}"
        if [[ ! -f "$CONFIG[RUST_DIR]/target/release/$binary_name" ]]; then
            needs_build=1
            break
        fi
    done
    
    if [[ $needs_build -eq 0 ]]; then
        log info "Rust services already built"
        return 0
    fi
    
    log info "Running cargo build --release (this may take a while)..."
    
    if (cd "$CONFIG[RUST_DIR]" && cargo build --release); then
        log success "Rust services built successfully"
        return 0
    else
        log error "Failed to build Rust services"
        return 1
    fi
}

function start_rust_service() {
    local service_name="$1"
    local port="$2"
    local binary_name="$3"
    local display_name="$4"
    
    if ! check_port "$port" "$display_name"; then
        log warn "$display_name already running on port $port"
        return 0
    fi
    
    local binary_path="$CONFIG[RUST_DIR]/target/release/$binary_name"
    
    if [[ ! -f "$binary_path" ]]; then
        log error "Binary not found: $binary_path"
        return 1
    fi
    
    log info "Starting $display_name..."
    
    # Set up environment
    local -x DATABASE_URL="postgresql://$CONFIG[POSTGRES_USER]:$CONFIG[POSTGRES_PASSWORD]@$CONFIG[POSTGRES_HOST]:$CONFIG[POSTGRES_PORT]/$CONFIG[POSTGRES_DB]"
    local -x REDIS_URL="redis://$CONFIG[REDIS_HOST]:$CONFIG[REDIS_PORT]"
    local -x JWT_SECRET="$CONFIG[JWT_SECRET]"
    local -x RUST_LOG="$CONFIG[RUST_LOG]"
    local -x RUST_BACKTRACE="$CONFIG[RUST_BACKTRACE]"
    
    # Special env for gateway
    if [[ "$service_name" == "gateway" ]]; then
        local -x GATEWAY_PORT="$port"
    fi
    
    # Start the service
    "$binary_path" &>/dev/null &
    local pid=$!
    PIDS[$service_name]=$pid
    
    # Wait for service to be ready
    local ready=0
    for i in {1..30}; do
        progress "Waiting for $display_name" "$i" 30
        
        if ! kill -0 "$pid" 2>/dev/null; then
            log error "$display_name died during startup"
            return 1
        fi
        
        # Check health endpoint
        if curl -sf "http://localhost:$port/health" &>/dev/null; then
            log success "$display_name is healthy and ready"
            ready=1
            break
        fi
        
        sleep 1
    done
    
    if [[ $ready -eq 0 ]]; then
        log error "$display_name failed to start within 30s"
        kill -TERM "$pid" 2>/dev/null
        return 1
    fi
    
    return 0
}

function start_all_rust_services() {
    print_section "Starting Rust Microservices"
    
    # Start services in order (gateway last)
    local service_order=(auth bookmarks import search gateway)
    
    for service in $service_order; do
        local service_def="$SERVICES[$service]"
        local port="${service_def%%:*}"
        local rest="${service_def#*:}"
        local binary_name="${rest%:*}"
        local display_name="${rest#*:}"
        
        if ! start_rust_service "$service" "$port" "$binary_name" "$display_name"; then
            return 1
        fi
    done
    
    return 0
}

function print_summary() {
    print_section "Startup Complete!"
    
    echo "\n${GREEN}✅ All services are running!${RESET}\n"
    
    echo "${BOLD}Service URLs:${RESET}"
    echo "  • Frontend:     ${CYAN}http://localhost:5173${RESET}"
    echo "  • API Gateway:  ${CYAN}http://localhost:8000${RESET}"
    echo "  • Health Check: ${CYAN}http://localhost:8000/health${RESET}"
    
    echo "\n${BOLD}Quick Test:${RESET}"
    echo "  curl http://localhost:8000/health"
    
    echo "\n${BOLD}Login Credentials:${RESET}"
    echo "  • Email:    admin@az1.ai"
    echo "  • Password: changeme123"
    
    echo "\n${BOLD}To start frontend:${RESET}"
    echo "  cd frontend"
    echo "  echo 'VITE_API_URL=http://localhost:8000/api' > .env"
    echo "  npm run dev"
    
    echo "\n${YELLOW}Press Ctrl+C to stop all services${RESET}\n"
}

function monitor_services() {
    # Monitor services in the background
    while true; do
        for service pid in ${(kv)PIDS}; do
            if ! kill -0 "$pid" 2>/dev/null; then
                log error "$service has crashed!"
                cleanup
                exit 1
            fi
        done
        sleep 5
    done
}

# ============================================================================
# Main
# ============================================================================

function main() {
    print_section "Bookmark Manager Startup"
    
    # Check dependencies
    local deps=(docker psql redis-cli curl cargo lsof)
    for dep in $deps; do
        if ! check_command "$dep"; then
            log error "Missing required dependency: $dep"
            exit 1
        fi
    done
    
    # Create logs directory
    mkdir -p "$CONFIG[LOGS_DIR]"
    
    # Start infrastructure
    if ! start_postgres; then
        log error "Failed to start PostgreSQL"
        exit 1
    fi
    
    if ! start_redis; then
        log error "Failed to start Redis"
        exit 1
    fi
    
    # Apply migrations
    if ! apply_migrations; then
        log error "Failed to apply database migrations"
        exit 1
    fi
    
    # Build Rust services
    if ! build_rust_services; then
        log error "Failed to build Rust services"
        exit 1
    fi
    
    # Start Rust services
    if ! start_all_rust_services; then
        log error "Failed to start Rust services"
        cleanup
        exit 1
    fi
    
    # Print summary
    print_summary
    
    # Monitor services
    monitor_services
}

# Run main function
main