# Performance Analysis

## Current Bottlenecks

### 1. LLM API Calls (6-36 seconds) - PRIMARY BOTTLENECK
- **Location**: `src/qwery_core/infrastructure/llm/azure.py`
- **Issue**: Azure OpenAI API response time varies significantly (6s to 36s)
- **Root Cause**: Network latency + Azure API processing time
- **Current Implementation**: Using sync `AzureOpenAI` client with `asyncio.to_thread()`

**Example from logs:**
```
[HANDLE_PROMPT_LLM_DONE] took=6.1945s  (first request)
[HANDLE_PROMPT_LLM_DONE] took=36.1479s (second request - 6x slower!)
```

### 2. SQL Execution (4-9 seconds) - SECONDARY BOTTLENECK
- **Location**: `src/qwery_core/infrastructure/database/sql_runner.py`
- **Issue**: Query execution time varies
- **Current Implementation**: Connection pooling is in place
- **Possible Causes**:
  - Complex queries
  - Database load
  - Network latency to database

**Example from logs:**
```
[HANDLE_PROMPT_SQL_EXECUTED] took=4.6597s  (first request)
[HANDLE_PROMPT_SQL_EXECUTED] took=9.3548s  (second request - 2x slower!)
```

## Enhanced Logging Added

### LLM Timing Logs
- `[LLM_AZURE_MSG_SIZE]` - Message character counts
- `[LLM_AZURE_API_CALL_DONE]` - Now includes thread wait time

### SQL Timing Logs
- `[POSTGRES_CURSOR_CREATE]` - Cursor creation time
- `[POSTGRES_EXECUTE]` - Now includes query length

## Recommendations

### Short-term (Immediate)
1. **Monitor the new logs** to identify patterns:
   - Are large prompts causing slow LLM responses?
   - Are specific queries consistently slow?
   - Is there connection pool contention?

### Medium-term (Optimizations)
1. **Use AsyncAzureOpenAI** if available (check with `from openai import AsyncAzureOpenAI`)
   - Would eliminate `asyncio.to_thread()` overhead
   - Better connection pooling

2. **Add request timeouts** to prevent hanging requests
   - LLM API: 60s timeout
   - SQL: 30s timeout

3. **Implement request queuing** for LLM calls
   - Prevent overwhelming Azure API
   - Better rate limit handling

### Long-term (Architecture)
1. **Stream LLM responses** instead of waiting for full response
   - Start processing as tokens arrive
   - Better perceived performance

2. **Cache LLM responses** for similar queries
   - Reduce redundant API calls
   - Faster responses for common queries

3. **Parallel execution** where possible
   - Run SQL and LLM in parallel if independent
   - Use async/await more effectively

## Next Steps

1. Run the server with new logs and collect data
2. Analyze patterns in the timing logs
3. Identify if specific queries/prompts are consistently slow
4. Consider implementing async Azure client if available


