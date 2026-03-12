## Evals integration verification

To verify that `qwery-core` is sending interactions to the external evals service:

1. Start the evals service and judge worker so that `POST /interactions/ingest-interactions` is available and `interaction_evals` can be populated.
2. Start the server with:
   - `TRACING_BASE_URL=http://localhost:4097`
   - `TRACING_API_KEY=local-dev` (or the key expected by evals)
   - `EVALS_SAMPLING_RATE=1.0` (no sampling for tests)
3. From the web app, open a project and send several chat messages through the main agent.
4. In the evals database, confirm that:
   - New rows appear in the `interactions` table with `app = 'web'`, `session_id` matching the conversation slug, and `task_type = 'code_help'`.
   - The judge worker processes those interactions and inserts metrics into `interaction_evals`.

