from __future__ import annotations

import argparse
import asyncio
import os
from typing import Optional

from ...application.services import create_agent, handle_prompt
from ...domain.entities import RequestContext


async def _chat_loop(
    agent_name: str,
    prompt: Optional[str],
    *,
    database_url: Optional[str] = None,
) -> None:
    agent = create_agent(require_database=True)
    request_context = RequestContext(headers={"x-user-id": agent_name}, cookies={})

    async def run_prompt(user_prompt: str) -> None:
        response = await handle_prompt(
            agent,
            request_context,
            user_prompt,
            database_url=database_url,
        )
        _print_agent_response(response)

    if prompt:
        await run_prompt(prompt)
        return

    print("Type natural language questions. Ctrl+C to exit.")
    while True:
        try:
            message = input("You> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye!")
            break

        if not message:
            continue

        await run_prompt(message)


def _print_agent_response(response: dict[str, object]) -> None:
    columns = response.get("columns", [])
    preview_rows = response.get("preview_rows") or []
    truncated = bool(response.get("truncated"))
    csv_filename = response.get("csv_filename")
    summary = response.get("summary", "")
    viz = response.get("visualization")
    sql = response.get("sql")

    if columns:
        header = ",".join(columns)
        if preview_rows:
            print(f"Agent> {header}")
            for row in preview_rows:
                print(",".join(str(value) for value in row))
            if truncated:
                print("(Results truncated to 20 rows. Full results saved to CSV.)")
        else:
            print(f"Agent> {header}")
            print("No rows returned for this query.")

    if csv_filename:
        print(f"Results saved to file: {csv_filename}")
        print(f"**IMPORTANT: FOR VISUALIZE_DATA USE FILENAME: {csv_filename}**")

    if viz:
        print(
            f"Agent> Created visualization '{viz.get('title')}' using a {viz.get('type')} chart."
        )

    if summary:
        print(f"Agent> {summary}")

    if sql:
        print(f"Agent> SQL: {sql}")

    suggestions = [
        "Show additional rows from this result",
        "Filter results by specific criteria",
        "Inspect columns for a particular table",
        "Create a different visualization of this data",
    ]
    print("If you want any of these next, tell me which:")
    for item in suggestions:
        print(f"- {item}.")


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Qwery text-to-SQL CLI")
    parser.add_argument("--user", default="cli-user", help="User identifier for the session")
    parser.add_argument("--prompt", help="Optional one-off question")
    parser.add_argument("--database-url", help="Database connection URL (overrides QWERY_DB_URL)")
    args = parser.parse_args(argv)

    database_url = args.database_url or os.getenv("QWERY_DB_URL") or os.getenv("QWERY_DB_PATH")

    asyncio.run(
        _chat_loop(
            agent_name=args.user,
            prompt=args.prompt,
            database_url=database_url,
        )
    )


if __name__ == "__main__":
    main()
