#!/bin/bash
# Recreate virtual environment and install dependencies

set -e

echo "Setting up virtual environment..."

# Remove old venv if exists
if [ -d ".venv" ]; then
    echo "Removing old .venv..."
    rm -rf .venv
fi

# Create new venv
echo "Creating new virtual environment..."
python3 -m venv .venv

# Activate and upgrade pip
echo "Activating venv and upgrading pip..."
source .venv/bin/activate
pip install --upgrade pip setuptools wheel

# Install dependencies
echo "Installing dependencies..."
if command -v poetry &> /dev/null; then
    echo "Using Poetry..."
    poetry install
else
    echo "Using pip (Poetry not found)..."
    pip install fastapi uvicorn[standard] python-dotenv sqlalchemy alembic plotly numpy psycopg2-binary openai anthropic websockets
    pip install pytest pytest-asyncio ruff mypy types-requests
fi

echo ""
echo "✓ Virtual environment created!"
echo ""
echo "To activate:"
echo "  source .venv/bin/activate"
echo ""
echo "Or use directly:"
echo "  .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory"

