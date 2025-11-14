#!/bin/bash
# Test HTTP streaming endpoint

BASE_URL="${BASE_URL:-http://localhost:8000}"

echo "=== Testing HTTP Streaming Endpoint ==="
echo ""

PROJECT_ID="test-project-123"
CHAT_ID="test-chat-456"

echo "Streaming response from: $BASE_URL/api/v1/projects/$PROJECT_ID/chats/$CHAT_ID/messages/stream"
echo ""

curl -N -X POST \
  "$BASE_URL/api/v1/projects/$PROJECT_ID/chats/$CHAT_ID/messages/stream" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "list all my tables"}' \
  2>/dev/null | while IFS= read -r line; do
    if [[ $line == data:* ]]; then
      # Extract JSON from SSE format
      json_data="${line#data: }"
      echo "$json_data" | jq -r 'if .type == "start" then "▶ Stream started" elif .type == "answer" then "💬 Answer: " + .content elif .type == "toon" then "📊 TOON Data:\n" + .content elif .type == "done" then "✅ Stream complete" elif .type == "error" then "❌ Error: " + .message else . end' 2>/dev/null || echo "$json_data"
    fi
  done

echo ""
echo "Done!"

