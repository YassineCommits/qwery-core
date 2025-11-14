#!/bin/bash
# Test database connection pooling

BASE_URL="${BASE_URL:-http://localhost:8000}"

echo "Testing database connection pooling..."
echo "Sending 20 concurrent SQL queries"
echo "Check server logs for [POSTGRES_POOL_GET] and [POSTGRES_POOL_PUT] messages"
echo ""

# Create a test request
REQUEST_BODY='{"prompt": "SELECT 1 as test"}'

# Send multiple concurrent requests
for i in {1..20}; do
    (
        curl -s -X POST \
            "$BASE_URL/api/v1/projects/test-project/test-chat/messages" \
            -H "Content-Type: application/json" \
            -d "$REQUEST_BODY" \
            -o /dev/null \
            -w "Request $i: %{http_code}\n"
    ) &
done

wait

echo ""
echo "Check server logs - you should see connection pool reuse"
echo "Look for: [POSTGRES_POOL_GET] and [POSTGRES_POOL_PUT]"

