No Supabase token refresh
Right now we accept access_token/refresh_token on connect and just reuse the access token forever. When Supabase’s JWT expires (≈1 h), every request starts failing with 401. We need to detect expiry, call auth.refresh_session(), update our cached session, and push the new tokens back to the client (or reconnect automatically). Without that, long-lived chats die silently.
In-memory session/state cache
SupabaseSessionManager keeps sessions and chat metadata in dictionaries inside the process. Spin up two FastAPI workers and they won’t see each other’s state—same user hitting worker B will re-fetch history and run without the updates stored in A. We need shared storage (Redis/LRU keyed by session, or store everything in Supabase and re-query) plus eviction strategy so thousands of chats don’t blow RAM.
WebSocket agent flow = single shot
The agent generates SQL, runs it, returns a summary. There’s no streaming (no MessageKind.REASONING or token-by-token feed), no retries, no fallbacks. If Postgres or the LLM hiccups, the user just sees [error …]. A more robust pipeline would either retry transient DB errors, offer tool recovery (e.g. rephrase query), or guide the user. Right now every failure is final.
No migrations / schema bootstrap
We assume Supabase already has guepard.gp_chats, gp_deployment_request, etc. There’s no Alembic or migration script to create/modify those tables, so onboarding another environment means manually reproducing the schema. Same with the local fallback DB: we require QWERY_DB_URL, but nothing ensures that database has the tables we expect.
Testing gaps
Unit tests stub out runners; we never hit a real Postgres or Supabase instance in CI. That hides issues like privileges, connection pool exhaustion, or JSON schema drifts. Integration tests should spin up ephemeral Postgres (or use Supabase test project) and run actual SQL + Supabase RPC calls. Also, concurrency/race conditions aren’t covered (e.g. two simultaneous prompts in same chat).
No rate limiting / quota control
Every prompt goes straight to the LLM and database. A noisy tenant could spam requests and rack up API costs or exhaust DB connections. We need per-tenant/per-user throttles, maybe Supabase Row Level Security for writes plus an explicit limiter (e.g. Redis token bucket) in FastAPI.
Observability
Logging is print-style. There’s no structured logs, no metrics (latency, success rate, LLM cost), no alerting. When something breaks in production you’d be flying blind. At minimum we’d add structured logging with correlation IDs, and maybe OTEL traces around the agent pipeline.
Ops tooling
There’s no flight recorder (keeping last N queries per chat), no admin tools to inspect conversations, no CLI to rehydrate caches. That becomes important when debugging user complaints.
Concurrency controls
We allow multiple prompts per chat concurrently; two WebSocket messages could race and both mutate history out of order. We should serialize per-chat (e.g. asyncio.Lock keyed by chat_id) to prevent overlapping writes.
Security hardening
We trust whatever project_id/chat_id the client sends. There’s no check that the Supabase user actually owns that deployment. We should enforce ownership via Supabase queries (join on gp_deployment_members etc.) before letting them run SQL. Also, the CLI stores JWTs in plain JSON—maybe acceptable for dev, but not production.
Some other nice-to-haves you might expect but we don’t have yet:
UI/UX beyond CLI.
Visualization persistence (we run Plotly but don’t store the chart).
Managed connection-string resolution for Supabase deployments instead of QWERY_DB_URL fallback.
Background cleanup of generated CSVs (they’ll pile up in data_storage/).
Documentation for environment setup, migrations, tokens; README is close but still lacks step-by-step supabase admin config.
Bottom line: the happy path is functional, but running this at scale or in prod would require addressing auth refresh, shared state, error handling, rate limiting, and operational tooling.