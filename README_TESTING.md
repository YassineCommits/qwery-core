# Testing Streaming & Scalability

## Quick Start

### 1. Start the Server

```bash
# Basic start
PYTHONPATH=src .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory

# With custom scalability settings
QWERY_DB_POOL_MAX=50 \
QWERY_MAX_CHAT_STATES=5000 \
QWERY_RATE_LIMIT_RPM=120 \
QWERY_LOG_LEVEL=INFO \
PYTHONPATH=src .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory
```

### 2. Run All Tests

```bash
# Run comprehensive test suite
./scripts/test_all.sh
```

## Individual Tests

### HTTP Streaming Test

```bash
# Simple streaming test
./scripts/test_streaming.sh

# Detailed streaming test with event parsing
PYTHONPATH=src .venv/bin/python scripts/test_streaming_detailed.py

# Test with custom prompt
PYTHONPATH=src .venv/bin/python scripts/test_streaming_detailed.py http://localhost:8000 "show me all customers"
```

### Rate Limiting Test

```bash
# Test rate limiting (should limit after 60 requests)
./scripts/test_rate_limit.sh

# Custom rate limit test
QWERY_RATE_LIMIT_RPM=30 ./scripts/test_rate_limit.sh
```

### WebSocket Concurrency Test

```bash
# Test 10 concurrent WebSocket connections
PYTHONPATH=src .venv/bin/python scripts/test_concurrent_ws.py ws://localhost:8000 10

# Test 50 concurrent connections
PYTHONPATH=src .venv/bin/python scripts/test_concurrent_ws.py ws://localhost:8000 50
```

### Database Connection Pooling Test

```bash
# Test connection pool reuse
./scripts/test_db_pool.sh

# Check server logs for:
# [POSTGRES_POOL_GET] - Getting connection from pool
# [POSTGRES_POOL_PUT] - Returning connection to pool
```

### Load Testing

```bash
# Run load tests (100 HTTP + 50 WebSocket)
./scripts/test_load.sh
```

## Manual Testing

### Test Streaming via curl

```bash
curl -N -X POST \
  http://localhost:8000/api/v1/projects/my-project/my-chat/messages/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "list all my tables"}'
```

### Test WebSocket via CLI

```bash
PYTHONPATH=src .venv/bin/python scripts/ws_cli.py \
  --base-url ws://localhost:8000 \
  --project-id test-project
```

### Test Rate Limiting

```bash
# Send 70 requests quickly
for i in {1..70}; do
  curl -s -w "%{http_code}\n" -o /dev/null http://localhost:8000/health
done
# Should see 429 after ~60 requests
```

## Monitoring

### Watch Server Logs

```bash
# Filter for scalability-related logs
tail -f server.log | grep -E '\[WS_|\[POSTGRES_POOL|\[RATE_LIMIT|\[WS_CLEANUP\]'

# Watch connection pool usage
tail -f server.log | grep POSTGRES_POOL

# Watch WebSocket connections
tail -f server.log | grep WS_CONNECTION
```

### Monitor Resource Usage

```bash
# CPU and Memory
watch -n 1 'ps aux | grep uvicorn | grep -v grep'

# Network connections
watch -n 1 'netstat -an | grep :8000 | wc -l'

# Database connections (if PostgreSQL)
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'your_db';"
```

## Expected Results

### Streaming
- Should receive `start` event
- Should receive `answer` event with human-readable text
- Should receive `toon` event with TOON-formatted data
- Should receive `done` event

### Rate Limiting
- First 60 requests: HTTP 200
- Requests 61+: HTTP 429 with Retry-After header

### Connection Pooling
- Multiple queries should reuse connections
- Logs should show `[POSTGRES_POOL_GET]` and `[POSTGRES_POOL_PUT]`
- Pool size should stay within configured limits

### WebSocket Scalability
- Should handle 10+ concurrent connections per chat
- Should evict old chat states when limit reached
- Should clean up inactive connections every 5 minutes

## Troubleshooting

### Server not starting
```bash
# Check if port is in use
lsof -i :8000

# Check Python environment
PYTHONPATH=src .venv/bin/python -c "import qwery_core; print('OK')"
```

### Rate limiting not working
- Check middleware is added in `server.py`
- Verify environment variables are set
- Check logs for `[RATE_LIMIT]` messages

### Connection pool issues
- Verify `psycopg2-binary` is installed
- Check database connection string
- Monitor pool size in logs

### WebSocket connection limits
- Check `QWERY_MAX_CONNECTIONS_PER_CHAT` setting
- Verify cleanup task is running (check logs)
- Monitor `[WS_CONNECTION_LIMIT]` messages

