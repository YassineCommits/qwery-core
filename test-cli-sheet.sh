#!/bin/bash
# Test CLI with Google Sheet query

: "${AZURE_API_KEY:?Set AZURE_API_KEY before running this script}"
export AZURE_API_KEY
export AZURE_RESOURCE_NAME="${AZURE_RESOURCE_NAME:-guepard-agent-rs}"
export AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:-gpt-5-mini}"
export VITE_AGENT_PROVIDER="${VITE_AGENT_PROVIDER:-azure}"
export AGENT_PROVIDER="${AGENT_PROVIDER:-azure}"
export VITE_WORKING_DIR="${VITE_WORKING_DIR:-workspace}"
export WORKING_DIR="${WORKING_DIR:-workspace}"

cd apps/cli

# Test by creating a notebook and running the query
echo "Testing Google Sheet query via CLI..."
echo "Query: list all data in this sheet https://docs.google.com/spreadsheets/d/1yfjcBF4X8waukFdI5u9ctkagFwAn-BRgM5IUCUK1Ay8/export?fomat=csv"
echo ""

# Initialize workspace
node dist/index.js workspace init <<< ""

# Create a test notebook (we'll use interactive mode to test)
echo "To test, run: node dist/index.js"
echo "Then in interactive mode, type the Google Sheet query"
