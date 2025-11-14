#!/bin/bash
# Test rate limiting

BASE_URL="${BASE_URL:-http://localhost:8000}"

echo "Testing rate limiting..."
echo "Sending 70 requests to /health endpoint"
echo ""

success=0
rate_limited=0

for i in {1..70}; do
    http_code=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/health")
    
    if [ "$http_code" == "200" ]; then
        success=$((success + 1))
        echo -n "."
    elif [ "$http_code" == "429" ]; then
        rate_limited=$((rate_limited + 1))
        echo ""
        echo "Request $i: Rate limited (429) - Expected!"
    else
        echo ""
        echo "Request $i: Unexpected status $http_code"
    fi
done

echo ""
echo ""
echo "Results:"
echo "  Successful: $success"
echo "  Rate limited: $rate_limited"
echo ""
echo "Expected: ~60 successful, then rate limited"

