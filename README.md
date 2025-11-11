# Qwery Core

Natural language to SQL with automatic charting and visualization.

## Features

- Text-to-SQL inference backed by OpenAI, Azure OpenAI, or Anthropic
- Automatic CSV persistence and Plotly visualization
- FastAPI server with streaming chat endpoints
- CLI for iterative analysis directly from the terminal

## Getting Started

```bash
poetry install
```

Set the environment variables:

- `QWERY_DB_PATH` – path to your SQLite database
- `QWERY_WORK_DIR` – directory for CSV outputs (default `./data_storage`)
- `QWERY_LLM_PROVIDER` – `openai` (default) or `anthropic`
- `QWERY_LLM_MODEL` – optional override for the provider model
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` – depending on provider
- `QWERY_AUTH_PROVIDER` – set to `supabase` to enforce Supabase-authenticated sessions
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` – required when using Supabase auth (optional `SUPABASE_SERVICE_ROLE_KEY` for admin flows)
- `QWERY_SUPABASE_GROUP_CLAIM` – optional metadata claim to read group memberships (default `roles`)

### Demo database

```bash
poetry run python -m scripts.bootstrap_db --path ./data/chinook_demo.sqlite
export QWERY_DB_PATH=$PWD/data/chinook_demo.sqlite
```

## CLI

```bash
poetry run qwery-cli --prompt "top 10 customers by revenue"
```

Interactive shell:

```bash
poetry run qwery-cli
```

## API + UI

```bash
poetry run uvicorn qwery_core.server:create_app --reload --host 0.0.0.0 --port 8000
```

This exposes the web UI at `/` and provides streaming chat endpoints under `/api/v2/*`.

## Supabase Integration & Limits

When `QWERY_AUTH_PROVIDER=supabase` the agent uses Supabase sessions and chat history. Current behaviour and limits:

- **Deployment foreign key** – You must supply an existing `guepard.gp_deployment_request.id`. Passing an arbitrary string or FQDN fails (FK violation). Use the GUID shown in Supabase for the target deployment.
- **Chat IDs** – `chat_id` may be a new UUID or an existing `guepard.gp_chats.id`. New chats are created automatically.
- **Connection string fallback** – We expect a managed connection string from Supabase. If the deployment row lacks one, the system falls back to `QWERY_DB_URL`/`QWERY_DB_PATH`. (TODO: replace once Supabase surfaces the connection string.)
- **In-memory session cache** – Session and chat state are cached per process. Thousands of simultaneous users on one worker is fine (grows linearly in RAM), but multiple workers replicate that cache. For horizontal scalability, provide an external store (Redis, Supabase) or add TTL eviction.
- **No cross-process coordination** – History/state updates aren’t synchronised across processes or containers. If you run multiple workers, ensure sticky sessions or centralise state.
- **LLM prompt context** – We only hydrate history stored in `gp_messages`/`gp_message_parts`. If rows are missing, prompts will start with just the latest message.
- **Rate limits & quotas** – There is no built-in throttling. Enforce limits at the API gateway or Supabase level if you expect high traffic.

For manual CLI tests:

```bash
ACCESS_TOKEN=$(jq -r '.access_token' tests/token.json)
REFRESH_TOKEN=$(jq -r '.refresh_token' tests/token.json)
PROJECT_ID=<existing gp_deployment_request id>
CHAT_ID=$(uuidgen)  # or existing gp_chats id

PYTHONPATH=src .venv/bin/python -m qwery_core.cli \
  --user my-analyst \
  --project-id "$PROJECT_ID" \
  --chat-id "$CHAT_ID" \
  --supabase-access-token "$ACCESS_TOKEN" \
  --supabase-refresh-token "$REFRESH_TOKEN"
```

If Supabase has not stored a connection string for the deployment yet, set `QWERY_DB_URL` to the fallback database URL before running the CLI or FastAPI service.

### WebSocket API

When Supabase auth is enabled, a realtime endpoint mirrors the REST/CLI flows:

```
ws /ws/agent/{project_id}/{chat_id}
```

- **Authorization**: send `Authorization: Bearer <access_token>` and optionally `X-Refresh-Token`.
- **Handshake**: the server immediately returns a `Handshake` protocol message confirming the deployment/chat IDs.
- **Messages**: send `ProtocolMessage` JSON (`kind: "Message"`) with a `payload.Message` body. The server persists the message, runs the agent, and broadcasts the response to every socket attached to that chat.
- **Commands**: `Set` commands for `database`, `database_url`, and `role` update the in-memory session context. Connection string handling still falls back to `QWERY_DB_URL` until Supabase exposes managed URLs.
- **Heartbeats**: `Heartbeat` payloads are echoed back to keep the connection alive.
- **Streaming**: the current implementation returns a single assistant summary (including the SQL and CSV filename). Chunk-level streaming is on the roadmap.
- **Limits**:
  - Websocket registries live in-process; use a single worker or add an external store for multi-instance deployments.
  - Idle chats are closed after 1 hour (`code 1001`).
  - Historical context comes from `gp_messages`/`gp_message_parts`; missing rows mean cold starts.

Example client snippet:

```python
import asyncio
import json
import websockets

async def main():
    uri = "ws://localhost:8000/ws/agent/PROJECT_ID/CHAT_ID"
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "X-Refresh-Token": REFRESH_TOKEN,
    }
    async with websockets.connect(uri, extra_headers=headers) as ws:
        print("Handshake:", await ws.recv())
        msg = {
            "id": "msg-1",
            "kind": "Message",
            "payload": {
                "Message": {
                    "role": "user",
                    "message_type": "text",
                    "content": "list my tables"
                }
            },
            "from": "client",
            "to": "server"
        }
        await ws.send(json.dumps(msg))
        print("Response:", await ws.recv())

asyncio.run(main())
```

### CLI helper for websocket testing

We ship a simple websocket CLI harness that pulls credentials from `tests/token.json`:

```bash
ACCESS_TOKEN=$(jq -r '.access_token' tests/token.json)
REFRESH_TOKEN=$(jq -r '.refresh_token' tests/token.json)

PYTHONPATH=src .venv/bin/python scripts/ws_cli.py \
  --base-url ws://localhost:8000 \
  --project-id <gp_deployment_request id> \
  --chat-id $(uuidgen) \
  --access-token "$ACCESS_TOKEN" \
  --refresh-token "$REFRESH_TOKEN"
```

Pass `--prompt "list my tables"` to run a single request without entering interactive mode.
