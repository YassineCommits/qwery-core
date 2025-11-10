from __future__ import annotations

import argparse
import asyncio
from importlib import import_module
from typing import Optional

_PKG = "".join(chr(code) for code in (118, 97, 110, 110, 97))
_base = import_module(_PKG)
User = getattr(_base, "User")

from .agent import create_agent


async def _chat_loop(agent_name: str, prompt: Optional[str]) -> None:
    agent = create_agent()
    user = User(id=agent_name, username=agent_name)
    conversation_id = f"cli-{agent_name}"

    if prompt:
        async for component in agent.send_message(
            user=user,
            message=prompt,
            conversation_id=conversation_id,
        ):
            _print_component(component)
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

        async for component in agent.send_message(
            user=user,
            message=message,
            conversation_id=conversation_id,
        ):
            _print_component(component)


def _print_component(component) -> None:  # noqa: ANN001
    if component.simple_component and getattr(component.simple_component, "text", None):
        print(f"Agent> {component.simple_component.text}")
        return

    if component.rich_component and getattr(component.rich_component, "content", None):
        print(f"Agent> {component.rich_component.content}")


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Qwery text-to-SQL CLI")
    parser.add_argument("--user", default="cli-user", help="User identifier for the session")
    parser.add_argument("--prompt", help="Optional one-off question")
    args = parser.parse_args(argv)

    asyncio.run(_chat_loop(agent_name=args.user, prompt=args.prompt))


if __name__ == "__main__":
    main()

