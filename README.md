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
