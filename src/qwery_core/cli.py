from __future__ import annotations

import argparse
import asyncio
from typing import Optional

from .agent import create_agent, handle_prompt
from .core import RequestContext


async def _chat_loop(agent_name: str, prompt: Optional[str]) -> None:
    agent = create_agent()
    request_context = RequestContext(headers={"x-user-id": agent_name}, cookies={})

    if prompt:
        response = await handle_prompt(agent, request_context, prompt)
        _print_agent_response(response)
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

        response = await handle_prompt(agent, request_context, message)
        _print_agent_response(response)


def _print_agent_response(response: dict[str, object]) -> None:
    columns = response.get("columns", [])
    preview_rows = response.get("preview_rows") or []
    truncated = bool(response.get("truncated"))
    csv_filename = response.get("csv_filename")
    summary = response.get("summary", "")
    viz = response.get("visualization")

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
    args = parser.parse_args(argv)

    asyncio.run(_chat_loop(agent_name=args.user, prompt=args.prompt))


if __name__ == "__main__":
    main()

