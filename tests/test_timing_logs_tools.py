"""Unit tests for tool timing logs."""

from __future__ import annotations

import logging
import os
import sqlite3
import tempfile
from unittest.mock import MagicMock

import pytest

from qwery_core.application.tools.sql import RunSqlTool
from qwery_core.application.tools.visualization import VisualizeDataTool
from qwery_core.infrastructure.database.sql_runner import SqliteRunner
from qwery_core.core import LocalFileSystem


@pytest.mark.asyncio
async def test_sql_tool_exec_start_log(caplog):
    """Test [SQL_TOOL_EXEC_START] log is emitted."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        runner = SqliteRunner(db_path)
        fs = LocalFileSystem("/tmp")
        tool = RunSqlTool(sql_runner=runner, file_system=fs)
        
        with caplog.at_level(logging.INFO):
            await tool.execute("SELECT 1")
        
        assert any("[SQL_TOOL_EXEC_START]" in record.message and "timestamp=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.mark.asyncio
async def test_sql_tool_run_done_log(caplog):
    """Test [SQL_TOOL_RUN_DONE] log is emitted with timing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.execute("INSERT INTO test VALUES (1)")
        conn.commit()
        conn.close()
        
        runner = SqliteRunner(db_path)
        fs = LocalFileSystem("/tmp")
        tool = RunSqlTool(sql_runner=runner, file_system=fs)
        
        with caplog.at_level(logging.INFO):
            await tool.execute("SELECT * FROM test")
        
        assert any("[SQL_TOOL_RUN_DONE]" in record.message and "took=" in record.message and "rows=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.mark.asyncio
async def test_viz_tool_exec_start_log(caplog):
    """Test [VIZ_TOOL_EXEC_START] log is emitted."""
    fs = LocalFileSystem("/tmp")
    tool = VisualizeDataTool(file_system=fs)
    
    data = {
        "x": [1, 2, 3],
        "y": [4, 5, 6],
    }
    
    with caplog.at_level(logging.INFO):
        await tool.execute(data=data, chart_type="bar", title="Test Chart")
    
    assert any("[VIZ_TOOL_EXEC_START]" in record.message and "timestamp=" in record.message for record in caplog.records)

