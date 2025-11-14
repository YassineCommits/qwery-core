#!/bin/bash
# Run all timing log unit tests

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Running Timing Log Unit Tests                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

PYTHONPATH=src .venv/bin/python -m pytest tests/test_timing_logs_*.py -v "$@"

