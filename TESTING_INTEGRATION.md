# Testing Text-to-SQL Integration

This guide will help you test the integration between the frontend React app and the Python backend WebSocket server.

## Prerequisites

1. **Backend dependencies**: Python environment with `qwery-core` installed
2. **Frontend dependencies**: Node.js 22+ and pnpm installed
3. **Database**: A test database (PostgreSQL or SQLite) for the backend to query

## Step 1: Set Up Environment Variables

### Backend (.env file in project root)

```bash
# Database connection (required)
QWERY_DB_URL=postgresql://user:password@localhost:5432/testdb
# OR for SQLite:
# QWERY_DB_PATH=/path/to/database.db

# LLM Provider (required - choose one)
OPENAI_API_KEY=your-openai-key
# OR
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment
# OR
ANTHROPIC_API_KEY=your-anthropic-key
```

### Frontend (.env file in apps/web)

```bash
# WebSocket server URL (optional, defaults to ws://localhost:8000)
VITE_WS_BASE_URL=ws://localhost:8000
```

## Step 2: Start the Backend Server

In terminal 1:

```bash
cd /home/guepard/work/qwery-core

# Activate virtual environment
source .venv/bin/activate

# Set environment variables (or use .env file)
export QWERY_DB_URL=postgresql://user:password@localhost:5432/testdb
export OPENAI_API_KEY=your-key

# Start the FastAPI server
PYTHONPATH=src .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory
```

You should see:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Step 3: Start the Frontend

In terminal 2:

```bash
cd /home/guepard/work/qwery-core

# Install dependencies (if not already done)
pnpm install

# Start the development server
pnpm dev
```

The frontend should start on `http://localhost:3000` (or another port if 3000 is taken).

## Step 4: Test the Integration

### 4.1 Open the Notebook Page

1. Navigate to `http://localhost:3000`
2. Log in (if authentication is required)
3. Navigate to a project's notebook page: `/project/{project-slug}/notebook`

### 4.2 Create a Prompt Cell

1. Click the "+" button or use the cell divider to add a new cell
2. Select "Prompt" as the cell type
3. Enter a natural language query, for example:
   - "Show me all users"
   - "List the top 10 products by sales"
   - "Count how many orders we have"

### 4.3 Generate SQL

1. Click the **"Generate SQL"** button in the prompt cell toolbar
2. The button should change to **"Generating..."** and be disabled
3. Wait for the response (usually 2-10 seconds depending on LLM)

### 4.4 Verify the Result

You should see:
- A new **query cell** appears below the prompt cell
- The query cell contains the generated SQL
- The SQL is properly formatted and ready to execute

### 4.5 Execute the Generated SQL

1. Select a datasource in the query cell (if not already selected)
2. Click the **Play** button to execute the SQL
3. Verify the results are displayed correctly

## Step 5: Debugging

### Check Backend Logs

Watch terminal 1 for:
- WebSocket connection messages
- SQL generation logs
- Any errors

### Check Frontend Console

Open browser DevTools (F12) and check:
- Console for WebSocket connection status
- Network tab for WebSocket messages
- Any error messages

### Common Issues

1. **"Not connected to SQL generation service"**
   - Check if backend is running on port 8000
   - Verify `VITE_WS_BASE_URL` matches backend URL
   - Check browser console for WebSocket connection errors

2. **"SQL generation failed"**
   - Check backend logs for errors
   - Verify database connection is working
   - Ensure LLM API key is valid
   - Check if database has the tables referenced in the prompt

3. **No response after clicking "Generate SQL"**
   - Check WebSocket connection in browser DevTools
   - Verify backend is receiving messages (check terminal 1)
   - Check for CORS issues

4. **SQL is generated but cell is not created**
   - Check browser console for errors
   - Verify notebook save mutation is working
   - Check if project ID is valid

## Step 6: Test with WebSocket CLI (Alternative)

You can also test the backend directly using the WebSocket CLI:

```bash
cd /home/guepard/work/qwery-core
PYTHONPATH=src .venv/bin/python scripts/ws_cli.py \
  --base-url ws://localhost:8000 \
  --project-id test-project \
  --prompt "show me all tables"
```

This will help verify the backend is working correctly before testing the frontend integration.

## Expected Behavior

✅ **Success Flow:**
1. User types prompt → clicks "Generate SQL"
2. Button shows "Generating..." (disabled)
3. Backend receives WebSocket message
4. Backend generates SQL using LLM
5. Backend sends response via WebSocket
6. Frontend receives response
7. New query cell is created with generated SQL
8. Button returns to "Generate SQL" (enabled)
9. Toast notification: "SQL generated successfully"

❌ **Error Flow:**
1. If connection fails → Toast: "Not connected to SQL generation service"
2. If generation fails → Toast: "SQL generation failed: {error}"
3. If no SQL in response → Toast: "No SQL generated"

## Additional Testing Scenarios

1. **Multiple concurrent requests**: Try generating SQL from multiple prompt cells quickly
2. **Long prompts**: Test with complex, multi-part queries
3. **Invalid prompts**: Test with prompts that don't make sense
4. **Connection recovery**: Disconnect and reconnect, verify it still works
5. **Different databases**: Test with different database schemas

