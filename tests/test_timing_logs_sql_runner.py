"""Unit tests for SQL runner timing logs."""

from __future__ import annotations

import logging
import os
import sqlite3
import tempfile

import pytest

from qwery_core.infrastructure.database.sql_runner import PostgresRunner, SqliteRunner


def test_sqlite_run_start_log(caplog):
    """Test [SQLITE_RUN_START] log is emitted."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        runner = SqliteRunner(db_path)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[SQLITE_RUN_START]" in record.message and "timestamp=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_sqlite_connect_log(caplog):
    """Test [SQLITE_CONNECT] log is emitted with timing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        runner = SqliteRunner(db_path)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[SQLITE_CONNECT]" in record.message and "took=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_sqlite_execute_log(caplog):
    """Test [SQLITE_EXECUTE] log is emitted with timing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        runner = SqliteRunner(db_path)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[SQLITE_EXECUTE]" in record.message and "took=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_sqlite_fetch_log(caplog):
    """Test [SQLITE_FETCH] log is emitted with timing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.execute("INSERT INTO test VALUES (1)")
        conn.commit()
        conn.close()
        
        runner = SqliteRunner(db_path)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT * FROM test")
        
        assert any("[SQLITE_FETCH]" in record.message and "took=" in record.message and "rows=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_sqlite_convert_log(caplog):
    """Test [SQLITE_CONVERT] log is emitted with timing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE test (id INTEGER)")
        conn.close()
        
        runner = SqliteRunner(db_path)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[SQLITE_CONVERT]" in record.message and "took=" in record.message and "total_took=" in record.message for record in caplog.records)
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.mark.skipif(
    os.environ.get("SKIP_POSTGRES_TESTS") == "1",
    reason="PostgreSQL tests require a running database"
)
def test_postgres_run_start_log(caplog):
    """Test [POSTGRES_RUN_START] log is emitted."""
    db_url = os.environ.get("QWERY_TEST_DB_URL", "postgresql://localhost/test")
    
    try:
        runner = PostgresRunner(db_url)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[POSTGRES_RUN_START]" in record.message and "timestamp=" in record.message for record in caplog.records)
    except Exception:
        pytest.skip("PostgreSQL not available")


@pytest.mark.skipif(
    os.environ.get("SKIP_POSTGRES_TESTS") == "1",
    reason="PostgreSQL tests require a running database"
)
def test_postgres_pool_get_log(caplog):
    """Test [POSTGRES_POOL_GET] log is emitted with timing."""
    db_url = os.environ.get("QWERY_TEST_DB_URL", "postgresql://localhost/test")
    
    try:
        runner = PostgresRunner(db_url)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[POSTGRES_POOL_GET]" in record.message and "took=" in record.message for record in caplog.records)
    except Exception:
        pytest.skip("PostgreSQL not available")


@pytest.mark.skipif(
    os.environ.get("SKIP_POSTGRES_TESTS") == "1",
    reason="PostgreSQL tests require a running database"
)
def test_postgres_execute_log(caplog):
    """Test [POSTGRES_EXECUTE] log is emitted with timing."""
    db_url = os.environ.get("QWERY_TEST_DB_URL", "postgresql://localhost/test")
    
    try:
        runner = PostgresRunner(db_url)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[POSTGRES_EXECUTE]" in record.message and "took=" in record.message for record in caplog.records)
    except Exception:
        pytest.skip("PostgreSQL not available")


@pytest.mark.skipif(
    os.environ.get("SKIP_POSTGRES_TESTS") == "1",
    reason="PostgreSQL tests require a running database"
)
def test_postgres_fetch_log(caplog):
    """Test [POSTGRES_FETCH] log is emitted with timing."""
    db_url = os.environ.get("QWERY_TEST_DB_URL", "postgresql://localhost/test")
    
    try:
        runner = PostgresRunner(db_url)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[POSTGRES_FETCH]" in record.message and "took=" in record.message and "rows=" in record.message for record in caplog.records)
    except Exception:
        pytest.skip("PostgreSQL not available")


@pytest.mark.skipif(
    os.environ.get("SKIP_POSTGRES_TESTS") == "1",
    reason="PostgreSQL tests require a running database"
)
def test_postgres_run_done_log(caplog):
    """Test [POSTGRES_RUN_DONE] log is emitted with total timing."""
    db_url = os.environ.get("QWERY_TEST_DB_URL", "postgresql://localhost/test")
    
    try:
        runner = PostgresRunner(db_url)
        
        with caplog.at_level(logging.INFO):
            runner.run("SELECT 1")
        
        assert any("[POSTGRES_RUN_DONE]" in record.message and "total_took=" in record.message for record in caplog.records)
    except Exception:
        pytest.skip("PostgreSQL not available")

