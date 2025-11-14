#!/bin/bash
# Scalability testing script for qwery-core

set -e

echo "=== Qwery Core Scalability Tests ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:8000}"
WS_URL="${WS_URL:-ws://localhost:8000}"

echo "Testing against: $BASE_URL"
echo ""

# Test 1: Health check
echo -e "${YELLOW}Test 1: Health Check${NC}"
curl -s "$BASE_URL/health" | jq .
echo ""

# Test 2: Rate limiting
echo -e "${YELLOW}Test 2: Rate Limiting (sending 70 requests quickly)${NC}"
echo "First 60 should succeed, then 429 errors..."
for i in {1..70}; do
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/health" -o /dev/null)
    http_code=$(echo "$response" | tail -n1)
    if [ "$http_code" == "429" ]; then
        echo -e "${RED}Request $i: Rate limited (429)${NC}"
        break
    else
        echo -n "."
    fi
done
echo ""
echo ""

# Test 3: Multiple WebSocket connections
echo -e "${YELLOW}Test 3: Multiple WebSocket Connections${NC}"
echo "This will test connection limits..."
echo "Run this in separate terminals to test concurrent connections:"
echo ""
echo "Terminal 1:"
echo "  PYTHONPATH=src .venv/bin/python scripts/ws_cli.py --base-url $WS_URL --project-id test-project-1"
echo ""
echo "Terminal 2:"
echo "  PYTHONPATH=src .venv/bin/python scripts/ws_cli.py --base-url $WS_URL --project-id test-project-2"
echo ""
echo "Terminal 3:"
echo "  PYTHONPATH=src .venv/bin/python scripts/ws_cli.py --base-url $WS_URL --project-id test-project-3"
echo ""

# Test 4: Database connection pooling
echo -e "${YELLOW}Test 4: Database Connection Pooling${NC}"
echo "Check logs for [POSTGRES_POOL_GET] and [POSTGRES_POOL_PUT] messages"
echo "Multiple queries should reuse connections from the pool"
echo ""

# Test 5: Chat history limits
echo -e "${YELLOW}Test 5: Chat History Limits${NC}"
echo "Send many messages in a chat and verify history is trimmed at 100 messages"
echo ""

# Test 6: Memory usage monitoring
echo -e "${YELLOW}Test 6: Memory Usage${NC}"
echo "Monitor memory with:"
echo "  watch -n 1 'ps aux | grep uvicorn | grep -v grep'"
echo ""

echo -e "${GREEN}All test instructions printed above${NC}"
echo ""
echo "To start the server with custom limits:"
echo "  QWERY_DB_POOL_MAX=50 QWERY_MAX_CHAT_STATES=5000 QWERY_RATE_LIMIT_RPM=120 PYTHONPATH=src .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory --workers 4"

