#!/bin/bash
# Load testing script

BASE_URL="${BASE_URL:-http://localhost:8000}"
WS_URL="${WS_URL:-ws://localhost:8000}"

echo "=== Load Testing ==="
echo ""

# Test 1: Many concurrent HTTP requests
echo "Test 1: 100 concurrent HTTP requests"
seq 1 100 | xargs -P 20 -I {} curl -s -X POST \
  "$BASE_URL/api/v1/projects/test-project/chat-{}/messages" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "SELECT 1"}' \
  -o /dev/null -w "Request {}: %{http_code}\n" | sort | uniq -c

echo ""

# Test 2: Many WebSocket connections
echo "Test 2: 50 concurrent WebSocket connections"
PYTHONPATH=src .venv/bin/python scripts/test_concurrent_ws.py "$WS_URL" 50

echo ""

# Test 3: Streaming under load
echo "Test 3: 10 concurrent streaming requests"
for i in {1..10}; do
    (
        curl -N -s -X POST \
            "$BASE_URL/api/v1/projects/test-project/stream-chat-$i/messages/stream" \
            -H "Content-Type: application/json" \
            -d '{"prompt": "list tables"}' \
            -o /dev/null &
    ) &
done
wait
echo "Streaming load test completed"

echo ""
echo "Monitor server with:"
echo "  watch -n 1 'ps aux | grep uvicorn'"
echo "  tail -f server.log | grep -E '\[WS_|\[POSTGRES_POOL|\[RATE_LIMIT\]'"

