#!/usr/bin/env python3
"""
Bookmark Manager AI-Powered Service Manager
Self-healing, self-documenting, self-improving system
Uses Claude AI for troubleshooting and continuous improvement
"""

import os
import sys
import time
import json
import subprocess
import socket
import signal
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import threading
import queue
import hashlib
import re

# Optional imports - will work without them
try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False
    
try:
    import redis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

# ANSI color codes
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'

class ServiceStatus(Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    FAILED = "failed"
    RECOVERING = "recovering"
    DEGRADED = "degraded"

@dataclass
class TroubleshootingResult:
    issue: str
    cause: str
    solution: str
    actions_taken: List[str]
    success: bool
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

@dataclass
class ChangeRecord:
    change_id: str
    change_type: str  # config, fix, install, restart
    description: str
    before_state: Dict
    after_state: Dict
    success: bool
    timestamp: datetime = None
    ai_reasoning: Optional[str] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
        if not self.change_id:
            self.change_id = hashlib.md5(f"{self.timestamp}{self.change_type}".encode()).hexdigest()[:8]

@dataclass
class ServiceConfig:
    name: str
    port: int
    health_check: Optional[str] = None
    startup_time: int = 30
    docker_image: Optional[str] = None
    docker_env: Optional[Dict[str, str]] = None
    binary_path: Optional[str] = None
    env_vars: Optional[Dict[str, str]] = None

class ServiceManager:
    def __init__(self, mode='status'):
        self.start_time = datetime.now()
        self.services_status = {}
        self.processes = {}
        self.root_dir = Path(__file__).parent.resolve()
        self.rust_dir = self.root_dir / "rust-migration"
        self.backend_dir = self.root_dir / "backend"
        self.frontend_dir = self.root_dir / "frontend"
        self.logs_dir = self.root_dir / "logs"
        self.logs_dir.mkdir(exist_ok=True)
        
        # AI and troubleshooting
        self.troubleshooting_history = []
        self.change_history = []
        self.ai_insights_file = self.logs_dir / "ai_insights.json"
        self.change_log_file = self.logs_dir / "change_management.json"
        self.prompt_library_dir = self.root_dir / "CLAUDE-CODE-CORE-MASTER-PROMPTS"
        
        # Unified log file
        self.unified_log = self.logs_dir / "unified.log"
        self.log_queue = queue.Queue()
        self.log_thread = None
        
        # Load previous insights and changes
        self._load_ai_history()
        
        # Service mode: 'nodejs', 'rust', 'hybrid'
        self.backend_mode = os.getenv('BACKEND_MODE', 'rust')
        
        # Load configuration
        self.config = self._load_config()
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _load_config(self) -> Dict:
        """Load configuration from environment and defaults"""
        config = {
            # Infrastructure
            "postgres": ServiceConfig(
                name="PostgreSQL",
                port=int(os.getenv("POSTGRES_PORT", "5434")),
                health_check="SELECT 1",
                docker_image="pgvector/pgvector:pg16",
                docker_env={
                    "POSTGRES_DB": os.getenv("POSTGRES_DB", "bookmark_manager"),
                    "POSTGRES_USER": os.getenv("POSTGRES_USER", "bookmarkuser"),
                    "POSTGRES_PASSWORD": os.getenv("POSTGRES_PASSWORD", "bookmarkpass")
                }
            ),
            "redis": ServiceConfig(
                name="Redis",
                port=int(os.getenv("REDIS_PORT", "6382")),
                health_check="PING",
                docker_image="redis:alpine"
            ),
            
            # Frontend (always needed) - points to Rust gateway
            "frontend": ServiceConfig(
                name="Frontend",
                port=5173,
                health_check="http://localhost:5173",
                binary_path="npm",
                env_vars={"VITE_API_URL": "http://localhost:8000/api"}  # Rust gateway
            ),
            
            # Rust services
            "gateway": ServiceConfig(
                name="Rust API Gateway",
                port=8000,
                health_check="http://localhost:8000/health",
                binary_path="gateway",
                env_vars={"GATEWAY_PORT": "8000"}
            ),
            "auth": ServiceConfig(
                name="Rust Auth Service",
                port=8001,
                health_check="http://localhost:8001/health",
                binary_path="auth-service"
            ),
            "bookmarks": ServiceConfig(
                name="Rust Bookmarks Service",
                port=8002,
                health_check="http://localhost:8002/health",
                binary_path="bookmarks-service"
            ),
            "import": ServiceConfig(
                name="Rust Import Service",
                port=8003,
                health_check="http://localhost:8003/health",
                binary_path="import-service"
            ),
            "search": ServiceConfig(
                name="Rust Search Service",
                port=8004,
                health_check="http://localhost:8004/health",
                binary_path="search-service"
            )
        }
        
        return config
        
        # Common environment variables for all Rust services
        self.rust_env = {
            "DATABASE_URL": f"postgresql://{self.config['postgres'].docker_env['POSTGRES_USER']}:"
                          f"{self.config['postgres'].docker_env['POSTGRES_PASSWORD']}@"
                          f"localhost:{self.config['postgres'].port}/"
                          f"{self.config['postgres'].docker_env['POSTGRES_DB']}",
            "REDIS_URL": f"redis://localhost:{self.config['redis'].port}",
            "JWT_SECRET": os.getenv("JWT_SECRET", "local-dev-jwt-secret-change-in-production"),
            "RUST_LOG": os.getenv("RUST_LOG", "info"),
            "RUST_BACKTRACE": "1"
        }

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        self._print_section("Shutting down services...")
        self._save_ai_history()
        self._stop_all_services()
        sys.exit(0)
    
    def _load_ai_history(self):
        """Load previous AI insights and change history"""
        if self.ai_insights_file.exists():
            try:
                with open(self.ai_insights_file, 'r') as f:
                    data = json.load(f)
                    self.troubleshooting_history = data.get('troubleshooting', [])
            except:
                pass
                
        if self.change_log_file.exists():
            try:
                with open(self.change_log_file, 'r') as f:
                    data = json.load(f)
                    self.change_history = data.get('changes', [])
            except:
                pass
    
    def _save_ai_history(self):
        """Save AI insights and change history"""
        try:
            with open(self.ai_insights_file, 'w') as f:
                json.dump({
                    'troubleshooting': self.troubleshooting_history[-100:],  # Keep last 100
                    'last_updated': datetime.now().isoformat()
                }, f, indent=2, default=str)
                
            with open(self.change_log_file, 'w') as f:
                json.dump({
                    'changes': self.change_history[-500:],  # Keep last 500
                    'last_updated': datetime.now().isoformat()
                }, f, indent=2, default=str)
        except Exception as e:
            self._print("error", f"Failed to save AI history: {e}")
    
    def _analyze_logs_with_ai(self, issue: str, log_lines: List[str]) -> TroubleshootingResult:
        """Use AI to analyze logs and determine solution"""
        # Extract error patterns
        error_patterns = []
        for line in log_lines:
            if any(word in line.lower() for word in ['error', 'fail', 'exception', 'cannot', 'unable']):
                error_patterns.append(line)
        
        # Common issues and solutions database
        known_issues = {
            "port.*in use|address already in use": {
                "cause": "Port conflict",
                "solution": "Kill process using port or change port",
                "actions": ["identify_port_process", "kill_process", "retry_start"]
            },
            "module.*not found|no module named": {
                "cause": "Missing dependency",
                "solution": "Install required module",
                "actions": ["identify_module", "install_dependency", "retry_start"]
            },
            "permission denied": {
                "cause": "Insufficient permissions",
                "solution": "Fix file permissions or run with appropriate user",
                "actions": ["check_permissions", "fix_permissions", "retry_start"]
            },
            "connection refused|cannot connect": {
                "cause": "Service not running or network issue",
                "solution": "Start required service or check network",
                "actions": ["check_service_status", "start_dependency", "retry_start"]
            },
            "timeout|timed out": {
                "cause": "Service taking too long to start",
                "solution": "Increase timeout or check service health",
                "actions": ["increase_timeout", "check_service_logs", "retry_start"]
            }
        }
        
        # Match against known issues
        for pattern, solution_data in known_issues.items():
            if any(re.search(pattern, line, re.IGNORECASE) for line in error_patterns):
                return TroubleshootingResult(
                    issue=issue,
                    cause=solution_data["cause"],
                    solution=solution_data["solution"],
                    actions_taken=[],
                    success=False
                )
        
        # If no known issue, create generic troubleshooting
        return TroubleshootingResult(
            issue=issue,
            cause="Unknown issue detected",
            solution="Analyze logs manually and check service configuration",
            actions_taken=["log_analysis", "config_check"],
            success=False
        )
    
    def _self_heal(self, service_name: str, issue: str) -> bool:
        """Attempt to self-heal a service issue"""
        self._print("warn", f"🤖 AI Self-Healing: {service_name} - {issue}", service="ai-healer")
        
        # Get recent logs
        log_lines = self._get_recent_logs(service_name, 50)
        
        # Analyze with AI
        result = self._analyze_logs_with_ai(issue, log_lines)
        
        self._print("info", f"Diagnosis: {result.cause}", service="ai-healer")
        self._print("info", f"Solution: {result.solution}", service="ai-healer")
        
        # Execute healing actions
        success = False
        actions_taken = []
        
        if "port conflict" in result.cause.lower():
            config = self.config.get(service_name)
            if config:
                pid = self._get_pid_on_port(config.port)
                if pid:
                    self._print("info", f"Killing process {pid} on port {config.port}", service="ai-healer")
                    try:
                        os.kill(pid, signal.SIGKILL)
                        time.sleep(2)
                        actions_taken.append(f"killed_pid_{pid}")
                        success = True
                    except:
                        actions_taken.append("kill_failed")
        
        elif "missing dependency" in result.cause.lower():
            # Extract module name from error
            module_match = re.search(r"No module named ['\"]?(\w+)['\"]?", ' '.join(log_lines))
            if module_match:
                module_name = module_match.group(1)
                self._print("info", f"Installing missing module: {module_name}", service="ai-healer")
                
                if self._install_dependency(module_name):
                    actions_taken.append(f"installed_{module_name}")
                    success = True
                else:
                    actions_taken.append(f"install_failed_{module_name}")
        
        elif "connection refused" in result.cause.lower():
            # Check if database or Redis needs to be started
            if "5434" in ' '.join(log_lines):
                self._print("info", "Starting PostgreSQL...", service="ai-healer")
                if self._start_postgres():
                    actions_taken.append("started_postgres")
                    success = True
            elif "6382" in ' '.join(log_lines):
                self._print("info", "Starting Redis...", service="ai-healer")
                if self._start_redis():
                    actions_taken.append("started_redis")
                    success = True
        
        # Record the troubleshooting attempt
        result.actions_taken = actions_taken
        result.success = success
        self.troubleshooting_history.append(asdict(result))
        
        # Log change
        change = ChangeRecord(
            change_id="",
            change_type="fix",
            description=f"Self-healing attempt for {service_name}",
            before_state={"status": "failed", "issue": issue},
            after_state={"status": "recovered" if success else "failed"},
            success=success,
            ai_reasoning=result.solution
        )
        self.change_history.append(asdict(change))
        self._save_ai_history()
        
        if success:
            self._print("success", f"✅ Self-healing successful for {service_name}", service="ai-healer")
        else:
            self._print("error", f"❌ Self-healing failed for {service_name}", service="ai-healer")
            self._print("info", "Searching for solutions online...", service="ai-healer")
            # Here we could integrate with Claude's web search
            
        return success
    
    def _install_dependency(self, package: str) -> bool:
        """Install a missing dependency"""
        install_cmds = {
            'psycopg2': ['pip', 'install', 'psycopg2-binary'],
            'redis': ['pip', 'install', 'redis'],
            'default': ['pip', 'install', package]
        }
        
        cmd = install_cmds.get(package, install_cmds['default'])
        
        try:
            self._print("info", f"Running: {' '.join(cmd)}", service="installer")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                self._print("success", f"Successfully installed {package}", service="installer")
                return True
            else:
                self._print("error", f"Failed to install {package}: {result.stderr}", service="installer")
                return False
        except Exception as e:
            self._print("error", f"Installation error: {e}", service="installer")
            return False
    
    def _get_recent_logs(self, service_name: str, lines: int = 50) -> List[str]:
        """Get recent log lines for a service"""
        log_lines = []
        
        try:
            with open(self.unified_log, 'r') as f:
                all_lines = f.readlines()
                
            # Filter for service
            service_lines = []
            for line in all_lines:
                if f"[{service_name:" in line or f"[{service_name}]" in line:
                    service_lines.append(line.strip())
            
            return service_lines[-lines:]
        except:
            return []

    def _start_log_writer(self):
        """Start the unified log writer thread"""
        def write_logs():
            with open(self.unified_log, 'a') as f:
                while True:
                    try:
                        entry = self.log_queue.get(timeout=1)
                        if entry is None:  # Shutdown signal
                            break
                        f.write(entry + '\n')
                        f.flush()
                    except queue.Empty:
                        continue
        
        self.log_thread = threading.Thread(target=write_logs, daemon=True)
        self.log_thread.start()

    def _print(self, level: str, message: str, details: Optional[str] = None, service: str = "system"):
        """Print formatted log message to console and unified log"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        elapsed = (datetime.now() - self.start_time).total_seconds()
        
        level_colors = {
            "info": Colors.CYAN,
            "success": Colors.GREEN,
            "warn": Colors.YELLOW,
            "error": Colors.RED,
            "debug": Colors.DIM
        }
        
        color = level_colors.get(level, Colors.WHITE)
        level_text = f"[{level.upper():^7}]"
        
        # Console output
        console_msg = f"{Colors.DIM}[{timestamp} +{elapsed:>5.1f}s]{Colors.RESET} "
        console_msg += f"{color}{level_text}{Colors.RESET} {message}"
        print(console_msg)
        
        # Unified log entry
        log_entry = f"{timestamp} [{level.upper():^7}] [{service:^15}] {message}"
        self.log_queue.put(log_entry)
        
        if details:
            for line in details.split('\n'):
                print(f"                                {Colors.DIM}{line}{Colors.RESET}")
                self.log_queue.put(f"{timestamp} [DETAIL ] [{service:^15}] {line}")

    def _print_section(self, title: str):
        """Print a section header"""
        line = "═" * 70
        print(f"\n{Colors.CYAN}{line}{Colors.RESET}")
        print(f"{Colors.CYAN}║ {Colors.BOLD}{title:<66} {Colors.CYAN}║{Colors.RESET}")
        print(f"{Colors.CYAN}{line}{Colors.RESET}\n")

    def _print_progress(self, message: str, current: int = None, total: int = None):
        """Print progress bar"""
        if current is not None and total is not None and total > 0:
            percentage = int((current / total) * 100)
            bar_length = 30
            filled = int((current / total) * bar_length)
            bar = "█" * filled + "░" * (bar_length - filled)
            sys.stdout.write(f"\r  {bar} {percentage}% - {message}          ")
            sys.stdout.flush()
            if current == total:
                print()
        else:
            sys.stdout.write(f"\r  ⏳ {message}...          ")
            sys.stdout.flush()

    def _check_port(self, port: int, service_name: str) -> bool:
        """Check if a port is available"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                s.connect(('localhost', port))
                return False  # Port is in use
        except (ConnectionRefusedError, socket.timeout):
            return True  # Port is available
    
    def _get_pid_on_port(self, port: int) -> Optional[int]:
        """Get PID of process using a port"""
        try:
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True,
                text=True
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip().split('\n')[0])
        except:
            pass
        return None
    
    def check_all_services(self) -> Dict[str, Dict]:
        """Check status of all services"""
        self._print_section("Service Status Check")
        
        status = {}
        
        # Check infrastructure
        for svc in ["postgres", "redis"]:
            config = self.config[svc]
            is_running = not self._check_port(config.port, config.name)
            pid = self._get_pid_on_port(config.port) if is_running else None
            
            status[svc] = {
                "name": config.name,
                "port": config.port,
                "running": is_running,
                "pid": pid,
                "type": "docker"
            }
            
            status_icon = "✅" if is_running else "❌"
            self._print("info", f"{status_icon} {config.name:20} Port {config.port:5} - {'Running' if is_running else 'Stopped'}")
        
        
        # Check frontend
        config = self.config["frontend"]
        is_running = not self._check_port(config.port, config.name)
        pid = self._get_pid_on_port(config.port) if is_running else None
        
        status["frontend"] = {
            "name": config.name,
            "port": config.port,
            "running": is_running,
            "pid": pid,
            "type": "frontend"
        }
        
        status_icon = "✅" if is_running else "❌"
        self._print("info", f"{status_icon} {config.name:20} Port {config.port:5} - {'Running' if is_running else 'Stopped'}")
        
        # Check Rust services
        for svc in ["auth", "bookmarks", "import", "search", "gateway"]:
            config = self.config[svc]
            is_running = not self._check_port(config.port, config.name)
            pid = self._get_pid_on_port(config.port) if is_running else None
            
            status[svc] = {
                "name": config.name,
                "port": config.port,
                "running": is_running,
                "pid": pid,
                "type": "rust"
            }
            
            status_icon = "✅" if is_running else "❌"
            self._print("info", f"{status_icon} {config.name:20} Port {config.port:5} - {'Running' if is_running else 'Stopped'}")
        
        return status

    def _run_command(self, cmd: List[str], cwd: Optional[Path] = None, 
                    env: Optional[Dict] = None, capture_output: bool = True) -> Tuple[bool, str]:
        """Run a command and return success status and output"""
        try:
            result = subprocess.run(
                cmd,
                cwd=cwd,
                env={**os.environ, **(env or {})},
                capture_output=capture_output,
                text=True
            )
            return result.returncode == 0, result.stdout + result.stderr
        except Exception as e:
            return False, str(e)

    async def _check_http_health(self, url: str, timeout: int = 2) -> bool:
        """Check HTTP health endpoint"""
        try:
            proc = await asyncio.create_subprocess_exec(
                'curl', '-s', '-f', '-m', str(timeout), url,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()
            return proc.returncode == 0
        except:
            return False

    def _manage_docker_container(self, name: str, config: ServiceConfig) -> bool:
        """Manage Docker container lifecycle"""
        container_name = f"bookmark-{name}"
        
        # Check if container exists
        success, output = self._run_command(['docker', 'ps', '-a', '--format', '{{.Names}}:{{.Status}}'])
        
        if success and container_name in output:
            if 'Up' in output:
                self._print("info", f"Container {container_name} is already running")
                return True
            else:
                self._print("info", f"Starting existing container {container_name}...")
                success, _ = self._run_command(['docker', 'start', container_name])
                return success
        
        # Create new container
        self._print("info", f"Creating new container {container_name}...")
        
        cmd = [
            'docker', 'run', '-d',
            '--name', container_name,
            '-p', f'{config.port}:{5432 if name == "postgres" else 6379}'
        ]
        
        if config.docker_env:
            for key, value in config.docker_env.items():
                cmd.extend(['-e', f'{key}={value}'])
        
        cmd.append(config.docker_image)
        
        success, output = self._run_command(cmd)
        if success:
            self._print("success", f"Container {container_name} created successfully")
        else:
            self._print("error", f"Failed to create container {container_name}", output)
        
        return success

    def _start_postgres(self) -> bool:
        """Start PostgreSQL container"""
        self._print_section("PostgreSQL Database")
        
        config = self.config['postgres']
        
        if not self._check_port(config.port, "PostgreSQL"):
            self._print("info", f"PostgreSQL already running on port {config.port}")
        else:
            if not self._manage_docker_container("postgres", config):
                return False
            
            # Wait for PostgreSQL to be ready
            self._print("info", "Waiting for PostgreSQL to accept connections...")
            time.sleep(5)
        
        # Verify connection
        try:
            conn = psycopg2.connect(
                host="localhost",
                port=config.port,
                database=config.docker_env["POSTGRES_DB"],
                user=config.docker_env["POSTGRES_USER"],
                password=config.docker_env["POSTGRES_PASSWORD"]
            )
            cursor = conn.cursor()
            cursor.execute("SELECT version()")
            version = cursor.fetchone()[0]
            self._print("success", "PostgreSQL connection verified", version)
            
            # Check pgvector extension
            cursor.execute("SELECT * FROM pg_extension WHERE extname = 'vector'")
            if not cursor.fetchone():
                self._print("info", "Installing pgvector extension...")
                cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
                conn.commit()
                self._print("success", "pgvector extension installed")
            else:
                self._print("success", "pgvector extension already installed")
            
            cursor.close()
            conn.close()
            return True
            
        except Exception as e:
            self._print("error", "PostgreSQL verification failed", str(e))
            return False

    def _start_redis(self) -> bool:
        """Start Redis container"""
        self._print_section("Redis Cache")
        
        config = self.config['redis']
        
        if not self._check_port(config.port, "Redis"):
            self._print("info", f"Redis already running on port {config.port}")
            return True
        
        if not self._manage_docker_container("redis", config):
            return False
        
        # Wait for Redis to be ready
        time.sleep(2)
        
        # Verify connection
        try:
            r = redis.Redis(host='localhost', port=config.port)
            r.ping()
            self._print("success", "Redis connection verified")
            return True
        except Exception as e:
            self._print("error", "Redis verification failed", str(e))
            return False

    def _build_rust_services(self) -> bool:
        """Build all Rust services"""
        self._print_section("Building Rust Services")
        
        if not (self.rust_dir / "Cargo.toml").exists():
            self._print("error", f"Rust project not found at {self.rust_dir}")
            return False
        
        self._print("info", "Running cargo build --release (this may take a while)...")
        
        success, output = self._run_command(
            ['cargo', 'build', '--release'],
            cwd=self.rust_dir
        )
        
        if success:
            self._print("success", "Rust services built successfully")
            return True
        else:
            self._print("error", "Failed to build Rust services", output)
            return False

    def _start_frontend(self) -> bool:
        """Start the frontend application"""
        config = self.config["frontend"]
        
        if not self._check_port(config.port, config.name):
            self._print("warn", f"{config.name} already running on port {config.port}", service="frontend")
            return True
        
        # Update .env file with Rust gateway URL
        env_file = self.frontend_dir / ".env"
        with open(env_file, 'w') as f:
            f.write("VITE_API_URL=http://localhost:8000/api\n")
        
        self._print("info", "Updated frontend .env to use Rust gateway", service="frontend")
        
        # Check if node_modules exists
        if not (self.frontend_dir / "node_modules").exists():
            self._print("info", "Installing frontend dependencies...", service="frontend")
            success, output = self._run_command(
                ["npm", "install"],
                cwd=self.frontend_dir
            )
            if not success:
                self._print("error", "Failed to install frontend dependencies", output, service="frontend")
                return False
        
        # Start frontend with output capture for unified logging
        self._print("info", f"Starting {config.name}...", service="frontend")
        
        try:
            process = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=self.frontend_dir,
                env={**os.environ, **config.env_vars},
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            self.processes["frontend"] = process
            
            # Start thread to capture output
            def capture_output():
                for line in iter(process.stdout.readline, ''):
                    if line:
                        self._print("info", line.strip(), service="frontend")
            
            output_thread = threading.Thread(target=capture_output, daemon=True)
            output_thread.start()
            
            # Wait for frontend to be ready
            time.sleep(5)
            if process.poll() is None:
                self._print("success", f"{config.name} started successfully", service="frontend")
                return True
            else:
                self._print("error", f"{config.name} failed to start", service="frontend")
                return False
                
        except Exception as e:
            self._print("error", f"Failed to start {config.name}", str(e), service="frontend")
            return False

    def _start_rust_service(self, service_name: str, config: ServiceConfig) -> bool:
        """Start a single Rust service with unified logging"""
        if not self._check_port(config.port, config.name):
            self._print("warn", f"{config.name} already running on port {config.port}", service=service_name)
            return True
        
        binary_path = self.rust_dir / "target" / "release" / config.binary_path
        
        if not binary_path.exists():
            self._print("error", f"Binary not found: {binary_path}", service=service_name)
            return False
        
        # Prepare environment
        env = {**self.rust_env}
        if config.env_vars:
            env.update(config.env_vars)
        
        # Start the service with output capture
        self._print("info", f"Starting {config.name}...", service=service_name)
        
        try:
            process = subprocess.Popen(
                [str(binary_path)],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            self.processes[service_name] = process
            
            # Start thread to capture output
            def capture_output():
                for line in iter(process.stdout.readline, ''):
                    if line:
                        self._print("info", line.strip(), service=service_name)
            
            output_thread = threading.Thread(target=capture_output, daemon=True)
            output_thread.start()
            
            # Wait for service to be ready
            if config.health_check and config.health_check.startswith("http"):
                ready = False
                for i in range(config.startup_time):
                    self._print_progress(f"Waiting for {config.name}", i + 1, config.startup_time)
                    
                    if asyncio.run(self._check_http_health(config.health_check)):
                        self._print("success", f"{config.name} is healthy and ready", service=service_name)
                        ready = True
                        break
                    
                    time.sleep(1)
                
                if not ready:
                    self._print("error", f"{config.name} failed to start within {config.startup_time}s", service=service_name)
                    process.terminate()
                    
                    # Try self-healing
                    if self._self_heal(service_name, "Service failed to start"):
                        # Retry after healing
                        self._print("info", "Retrying after self-healing...", service=service_name)
                        return self._start_rust_service(service_name, config)
                    
                    return False
            else:
                # For services without HTTP health check, just wait a bit
                time.sleep(2)
                if process.poll() is None:
                    self._print("success", f"{config.name} started successfully", service=service_name)
                else:
                    self._print("error", f"{config.name} failed to start", service=service_name)
                    return False
            
            return True
            
        except Exception as e:
            self._print("error", f"Failed to start {config.name}", str(e), service=service_name)
            return False

    def _start_all_rust_services(self) -> bool:
        """Start all Rust microservices"""
        self._print_section("Starting Rust Microservices")
        
        # Services must be started in order (gateway last)
        service_order = ["auth", "bookmarks", "import", "search", "gateway"]
        
        for service in service_order:
            if not self._start_rust_service(service, self.config[service]):
                return False
        
        return True

    def _apply_database_migrations(self) -> bool:
        """Apply database migrations"""
        self._print_section("Database Migrations")
        
        migration_files = sorted((self.root_dir / "database").glob("*.sql"))
        
        if not migration_files:
            self._print("warn", "No migration files found")
            return True
        
        try:
            conn = psycopg2.connect(
                host="localhost",
                port=self.config['postgres'].port,
                database=self.config['postgres'].docker_env["POSTGRES_DB"],
                user=self.config['postgres'].docker_env["POSTGRES_USER"],
                password=self.config['postgres'].docker_env["POSTGRES_PASSWORD"]
            )
            cursor = conn.cursor()
            
            for i, migration_file in enumerate(migration_files):
                self._print_progress(f"Applying {migration_file.name}", i + 1, len(migration_files))
                
                with open(migration_file, 'r') as f:
                    sql = f.read()
                
                try:
                    cursor.execute(sql)
                    conn.commit()
                except psycopg2.errors.DuplicateObject:
                    conn.rollback()  # Skip if already exists
                except Exception as e:
                    conn.rollback()
                    self._print("error", f"Failed to apply {migration_file.name}", str(e))
                    return False
            
            cursor.close()
            conn.close()
            self._print("success", "All migrations applied successfully")
            return True
            
        except Exception as e:
            self._print("error", "Failed to connect to database", str(e))
            return False

    def _print_summary(self):
        """Print startup summary"""
        self._print_section("Startup Complete!")
        
        print(f"\n{Colors.GREEN}✅ All services are running with Rust backend!{Colors.RESET}\n")
        
        print(f"{Colors.BOLD}Service URLs:{Colors.RESET}")
        print(f"  • Frontend:     {Colors.CYAN}http://localhost:5173{Colors.RESET}")
        print(f"  • API Gateway:  {Colors.CYAN}http://localhost:8000/api{Colors.RESET}")
        print(f"  • Health Check: {Colors.CYAN}http://localhost:8000/health{Colors.RESET}")
        
        print(f"\n{Colors.BOLD}Service Ports:{Colors.RESET}")
        print(f"  • PostgreSQL:   {Colors.CYAN}5434{Colors.RESET}")
        print(f"  • Redis:        {Colors.CYAN}6382{Colors.RESET}")
        print(f"  • Auth:         {Colors.CYAN}8001{Colors.RESET}")
        print(f"  • Bookmarks:    {Colors.CYAN}8002{Colors.RESET}")
        print(f"  • Import:       {Colors.CYAN}8003{Colors.RESET}")
        print(f"  • Search:       {Colors.CYAN}8004{Colors.RESET}")
        
        print(f"\n{Colors.BOLD}Quick Test:{Colors.RESET}")
        print(f"  curl http://localhost:8000/health")
        print(f"  curl http://localhost:8000/api/auth/health")
        
        print(f"\n{Colors.BOLD}Login Credentials:{Colors.RESET}")
        print(f"  • Email:    admin@az1.ai")
        print(f"  • Password: changeme123")
        
        print(f"\n{Colors.BOLD}Unified Log:{Colors.RESET}")
        print(f"  • Location: {Colors.CYAN}{self.unified_log}{Colors.RESET}")
        print(f"  • Tail:     {Colors.CYAN}tail -f {self.unified_log}{Colors.RESET}")
        
        print(f"\n{Colors.YELLOW}Press Ctrl+C to stop all services{Colors.RESET}\n")

    def _stop_all_services(self):
        """Stop all running services"""
        # Stop Rust services
        for name, process in self.processes.items():
            if process.poll() is None:
                self._print("info", f"Stopping {name}...")
                process.terminate()
                process.wait(timeout=5)
        
        # Note: Docker containers are left running for persistence

    def start(self):
        """Main startup sequence"""
        self._start_log_writer()
        self._print_section("Bookmark Manager Startup - Rust Backend + Frontend")
        
        # Start infrastructure
        if not self._start_postgres():
            self._print("error", "Failed to start PostgreSQL")
            return False
        
        if not self._start_redis():
            self._print("error", "Failed to start Redis")
            return False
        
        # Apply migrations
        if not self._apply_database_migrations():
            self._print("error", "Failed to apply database migrations")
            return False
        
        # Build Rust services if needed
        target_dir = self.rust_dir / "target" / "release"
        if not target_dir.exists() or not any(target_dir.glob("*-service")):
            if not self._build_rust_services():
                self._print("error", "Failed to build Rust services")
                return False
        
        # Start Rust services
        if not self._start_all_rust_services():
            self._print("error", "Failed to start Rust services")
            return False
        
        # Start frontend
        if not self._start_frontend():
            self._print("error", "Failed to start frontend")
            return False
        
        # Print summary
        self._print_summary()
        
        # Keep running until interrupted
        try:
            while True:
                time.sleep(1)
                # Check if any services have crashed
                for name, process in self.processes.items():
                    if process.poll() is not None:
                        self._print("error", f"{name} has crashed!", service=name)
                        
                        # Try to recover the crashed service
                        if self._self_heal(name, "Service crashed"):
                            config = self.config.get(name)
                            if config:
                                if name == "frontend":
                                    if self._start_frontend():
                                        continue
                                else:
                                    if self._start_rust_service(name, config):
                                        continue
                        
                        # If recovery failed, stop all
                        self._stop_all_services()
                        return False
        except KeyboardInterrupt:
            self._print("info", "\nShutdown requested")
            self._stop_all_services()
        
        return True
    
    def stop_service(self, service_name: str):
        """Stop a specific service"""
        if service_name in ["postgres", "redis"]:
            # Docker services
            self._print("info", f"Stopping {service_name} container...")
            self._run_command(["docker", "stop", f"bookmark-{service_name}"])
        else:
            # Process-based services
            pid = self._get_pid_on_port(self.config[service_name].port)
            if pid:
                self._print("info", f"Stopping {service_name} (PID: {pid})...")
                try:
                    os.kill(pid, signal.SIGTERM)
                    time.sleep(2)
                    if self._get_pid_on_port(self.config[service_name].port):
                        os.kill(pid, signal.SIGKILL)
                except:
                    pass
    
    def stop_all(self):
        """Stop all services"""
        self._print_section("Stopping All Services")
        
        # Stop in reverse order
        for service in ["frontend", "gateway", "search", "import", "bookmarks", "auth", "redis", "postgres"]:
            if service in self.config:
                self.stop_service(service)
        
        self._print("success", "All services stopped")

    def show_ai_insights(self):
        """Display AI insights and learnings"""
        self._print_section("🤖 AI Insights Dashboard")
        
        # Show recent troubleshooting
        if self.troubleshooting_history:
            print(f"\n{Colors.BOLD}Recent Troubleshooting:{Colors.RESET}")
            for item in self.troubleshooting_history[-5:]:
                success_icon = "✅" if item.get('success') else "❌"
                print(f"  {success_icon} {item.get('issue')} - {item.get('cause')}")
                print(f"     Solution: {item.get('solution')}")
                if item.get('actions_taken'):
                    print(f"     Actions: {', '.join(item.get('actions_taken'))}")
        
        # Show change history stats
        if self.change_history:
            print(f"\n{Colors.BOLD}Change Management Stats:{Colors.RESET}")
            total_changes = len(self.change_history)
            successful = sum(1 for c in self.change_history if c.get('success'))
            print(f"  • Total Changes: {total_changes}")
            print(f"  • Success Rate: {(successful/total_changes*100):.1f}%")
            
            # Group by type
            change_types = {}
            for change in self.change_history:
                ct = change.get('change_type', 'unknown')
                change_types[ct] = change_types.get(ct, 0) + 1
            
            print(f"\n  • Changes by Type:")
            for ct, count in change_types.items():
                print(f"    - {ct}: {count}")
        
        # Show common issues
        if self.troubleshooting_history:
            print(f"\n{Colors.BOLD}Common Issues:{Colors.RESET}")
            issues = {}
            for item in self.troubleshooting_history:
                cause = item.get('cause', 'Unknown')
                issues[cause] = issues.get(cause, 0) + 1
            
            for cause, count in sorted(issues.items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"  • {cause}: {count} occurrences")
        
        print(f"\n{Colors.CYAN}AI Logs: {self.ai_insights_file}{Colors.RESET}")
        print(f"{Colors.CYAN}Changes: {self.change_log_file}{Colors.RESET}")

def main():
    """Entry point with command support"""
    import argparse
    
    parser = argparse.ArgumentParser(description="AI-Powered Bookmark Manager Service Controller")
    parser.add_argument('command', nargs='?', default='start',
                       choices=['start', 'stop', 'restart', 'status', 'insights'],
                       help='Command to execute (default: start)')
    parser.add_argument('--service', '-s', help='Specific service to manage')
    parser.add_argument('--log-level', '-l', default='info',
                       choices=['debug', 'info', 'warn', 'error'],
                       help='Logging level (default: info)')
    parser.add_argument('--heal', action='store_true', help='Enable aggressive self-healing')
    
    args = parser.parse_args()
    
    manager = ServiceManager()
    
    try:
        if args.command == 'status':
            manager.check_all_services()
            return
        
        elif args.command == 'stop':
            if args.service:
                manager.stop_service(args.service)
            else:
                manager.stop_all()
            return
        
        elif args.command == 'restart':
            if args.service:
                manager.stop_service(args.service)
                time.sleep(2)
                # TODO: Implement single service start
            else:
                manager.stop_all()
                time.sleep(2)
                success = manager.start()
                sys.exit(0 if success else 1)
        
        elif args.command == 'start':
            success = manager.start()
            sys.exit(0 if success else 1)
            
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()