#!/bin/bash

# Log helper scripts for unified logging

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/../logs/unified.log"

case "$1" in
  "tail")
    # Real-time log monitoring
    tail -f "$LOG_FILE" | jq -r '[.timestamp, .level, .service, .message] | @tsv' 2>/dev/null || tail -f "$LOG_FILE"
    ;;
  
  "errors")
    # Show only errors
    grep '"level":"error"' "$LOG_FILE" | jq -r '[.timestamp, .service, .message, .metadata.error.message // ""] | @tsv' 2>/dev/null || grep -i error "$LOG_FILE"
    ;;
  
  "service")
    # Show logs for specific service
    if [ -z "$2" ]; then
      echo "Usage: $0 service <service-name>"
      exit 1
    fi
    grep "\"service\":\"$2\"" "$LOG_FILE" | jq -r '[.timestamp, .level, .message] | @tsv' 2>/dev/null || grep "\"service\":\"$2\"" "$LOG_FILE"
    ;;
  
  "websocket")
    # Show WebSocket-related logs
    grep -E '"service":"websocket"|WebSocket|socket\.io' "$LOG_FILE" | jq -r '[.timestamp, .level, .service, .message] | @tsv' 2>/dev/null
    ;;
  
  "auth")
    # Show authentication-related logs
    grep -E '"service":"auth|auth-middleware"|login|Authentication' "$LOG_FILE" | jq -r '[.timestamp, .level, .service, .message] | @tsv' 2>/dev/null
    ;;
  
  "recent")
    # Show last 100 lines formatted
    tail -n 100 "$LOG_FILE" | jq -r '[.timestamp, .level, .service, .message] | @tsv' 2>/dev/null || tail -n 100 "$LOG_FILE"
    ;;
  
  "stats")
    # Show log statistics
    echo "=== Unified Log Statistics ==="
    echo "File: $LOG_FILE"
    echo "Size: $(du -h "$LOG_FILE" | cut -f1)"
    echo "Lines: $(wc -l < "$LOG_FILE")"
    echo ""
    echo "=== Log Levels ==="
    echo "Errors: $(grep -c '"level":"error"' "$LOG_FILE")"
    echo "Warnings: $(grep -c '"level":"warn"' "$LOG_FILE")"
    echo "Info: $(grep -c '"level":"info"' "$LOG_FILE")"
    echo "Debug: $(grep -c '"level":"debug"' "$LOG_FILE")"
    echo ""
    echo "=== Services ==="
    grep -o '"service":"[^"]*"' "$LOG_FILE" | sort | uniq -c | sort -nr | head -20
    ;;
  
  *)
    echo "Unified Log Helper Commands:"
    echo "  $0 tail       - Real-time log monitoring"
    echo "  $0 errors     - Show only errors"
    echo "  $0 service X  - Show logs for service X"
    echo "  $0 websocket  - Show WebSocket-related logs"
    echo "  $0 auth       - Show authentication logs"
    echo "  $0 recent     - Show last 100 log entries"
    echo "  $0 stats      - Show log statistics"
    ;;
esac