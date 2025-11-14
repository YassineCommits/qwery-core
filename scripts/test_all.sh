#!/bin/bash
# Comprehensive test script for streaming and scalability

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:8000}"
WS_URL="${WS_URL:-ws://localhost:8000}"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Qwery Core - Streaming & Scalability Tests            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if server is running
echo -e "${YELLOW}[1/6] Checking server health...${NC}"
if curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server is not running. Start it with:${NC}"
    echo "  PYTHONPATH=src .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory"
    exit 1
fi
echo ""

# Test 1: HTTP Streaming
echo -e "${YELLOW}[2/6] Testing HTTP Streaming (SSE)...${NC}"
echo "Sending streaming request..."
http_code=$(curl -N -s -w "%{http_code}" -X POST \
  "$BASE_URL/api/v1/projects/test-project/test-chat/messages/stream" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "list my tables"}' \
  -o /tmp/stream_test.out 2>/dev/null)
if [ "$http_code" == "200" ]; then
    echo "Streaming response received (first 5 lines):"
    head -n 5 /tmp/stream_test.out
    echo -e "${GREEN}✓ Streaming test completed${NC}"
else
    echo -e "${RED}✗ Streaming failed with HTTP $http_code${NC}"
    echo "Response:"
    cat /tmp/stream_test.out 2>/dev/null || echo "(no response)"
    echo ""
    echo -e "${YELLOW}⚠ Note: Make sure the server was restarted after code changes${NC}"
fi
echo ""

# Test 2: Rate Limiting
echo -e "${YELLOW}[3/6] Testing Rate Limiting...${NC}"
echo "Sending 70 requests to /api endpoint (should rate limit after 60)..."
echo "Note: /health is excluded from rate limiting"
success=0
rate_limited=0
errors=0
for i in {1..70}; do
    # Use an API endpoint that's rate limited (not /health)
    http_code=$(curl -s -w "%{http_code}" -X POST \
        "$BASE_URL/api/v1/projects/test-project/test-chat-$i/messages" \
        -H "Content-Type: application/json" \
        -d '{"prompt": "test"}' \
        -o /dev/null 2>/dev/null)
    if [ "$http_code" == "200" ]; then
        success=$((success + 1))
        if [ $i -le 10 ]; then
            echo -n "."
        fi
    elif [ "$http_code" == "429" ]; then
        rate_limited=$((rate_limited + 1))
        echo ""
        echo "Rate limited at request $i (expected)"
        break
    else
        errors=$((errors + 1))
        if [ $i -le 5 ]; then
            echo -n "E"
        fi
    fi
done
echo ""
if [ $rate_limited -gt 0 ]; then
    echo -e "${GREEN}✓ Rate limiting working: $success successful, $rate_limited rate limited, $errors errors${NC}"
elif [ $success -gt 0 ]; then
    echo -e "${YELLOW}⚠ Rate limiting: $success successful, $rate_limited rate limited, $errors errors (may need DB connection)${NC}"
else
    echo -e "${RED}✗ Rate limiting test failed: $success successful, $rate_limited rate limited, $errors errors${NC}"
fi
echo ""

# Test 3: Concurrent WebSocket Connections
echo -e "${YELLOW}[4/6] Testing Concurrent WebSocket Connections...${NC}"
echo "Starting 10 concurrent WebSocket connections..."
PYTHONPATH=src .venv/bin/python scripts/test_concurrent_ws.py "$WS_URL" 10 2>&1 | tail -n 5
echo -e "${GREEN}✓ Concurrent WebSocket test completed${NC}"
echo ""

# Test 4: Database Connection Pooling
echo -e "${YELLOW}[5/6] Testing Database Connection Pooling...${NC}"
echo "Sending 20 concurrent SQL queries..."
echo "Check server logs for pool reuse messages"
for i in {1..20}; do
    curl -s -X POST \
        "$BASE_URL/api/v1/projects/test-project/test-chat-$i/messages" \
        -H "Content-Type: application/json" \
        -d '{"prompt": "SELECT 1 as test"}' \
        -o /dev/null &
done
wait
echo -e "${GREEN}✓ Database pool test completed (check logs for [POSTGRES_POOL_GET])${NC}"
echo ""

# Test 5: Memory and State Management
echo -e "${YELLOW}[6/6] Testing Memory Limits...${NC}"
echo "Creating multiple chat sessions to test LRU eviction..."
for i in {1..15}; do
    curl -s -X POST \
        "$BASE_URL/api/v1/projects/test-project/chat-$i/messages" \
        -H "Content-Type: application/json" \
        -d '{"prompt": "test"}' \
        -o /dev/null &
done
wait
echo -e "${GREEN}✓ Memory management test completed${NC}"
echo ""

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  All Tests Completed!                                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Check server logs for:"
echo "  - [POSTGRES_POOL_GET/PUT] - Connection pool reuse"
echo "  - [WS_CONNECTION_ADDED] - WebSocket connections"
echo "  - [WS_STATE_EVICT] - LRU eviction"
echo "  - [WS_CLEANUP] - Background cleanup"

