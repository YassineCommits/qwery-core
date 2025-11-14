# Timing Log Unit Tests

This directory contains comprehensive unit tests for all timing logs in the qwery-core system.

## Test Files

- `test_timing_logs_websocket.py` - Tests WebSocket timing logs (`[WS_*]`)
- `test_timing_logs_agent.py` - Tests agent timing logs (`[HANDLE_PROMPT_*]`)
- `test_timing_logs_sql_runner.py` - Tests SQL runner timing logs (`[SQLITE_*]`, `[POSTGRES_*]`)
- `test_timing_logs_llm.py` - Tests LLM timing logs (`[LLM_*]`)
- `test_timing_logs_tools.py` - Tests tool timing logs (`[SQL_TOOL_*]`, `[VIZ_TOOL_*]`)

## Running Tests

### Run All Timing Log Tests

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_*.py -v
```

### Run Specific Test File

```bash
# WebSocket timing logs
PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_websocket.py -v

# Agent timing logs
PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_agent.py -v

# SQL runner timing logs
PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_sql_runner.py -v

# Tools timing logs
PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_tools.py -v
```

### Run Specific Test

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_websocket.py::test_ws_connect_start_log -v
```

## Test Coverage

These tests verify that:
1. Timing logs are emitted with correct prefixes (`[WS_*]`, `[HANDLE_PROMPT_*]`, etc.)
2. Timing information is included (`took=`, `timestamp=`)
3. Relevant context is logged (query lengths, row counts, etc.)

## Notes

- PostgreSQL tests are skipped if `SKIP_POSTGRES_TESTS=1` is set
- LLM API tests are skipped (require API keys)
- Tests use `caplog` fixture to capture and verify log messages

