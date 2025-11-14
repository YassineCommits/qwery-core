from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import sys
from typing import Optional
from uuid import uuid4

from websockets.exceptions import ConnectionClosedError
from websockets.legacy.client import connect as ws_connect

from qwery_core.domain.protocols import MessageKind, MessageRole, ProtocolMessage, create_text_message


async def _interactive_chat(
    *,
    base_url: str,
    project_id: str,
    chat_id: str,
    initial_prompt: Optional[str],
) -> None:
    uri = f"{base_url.rstrip('/')}/ws/agent/{project_id}/{chat_id}"

    async with ws_connect(
        uri,
        ping_interval=None,
        open_timeout=30,
        close_timeout=30,
    ) as ws:
        handshake = await ws.recv()
        print(f"[handshake] {handshake}")

        receiver_stop = asyncio.Event()
        response_event = asyncio.Event()

        async def receiver() -> None:
            try:
                while not receiver_stop.is_set():
                    response = await ws.recv()
                    try:
                        parsed = ProtocolMessage.model_validate_json(response)
                    except Exception:
                        print(f"[assistant]\n{response}\n")
                        continue

                    if parsed.kind == MessageKind.MESSAGE and parsed.payload.message:
                        print(f"[assistant]\n{parsed.payload.message.content}\n")
                        response_event.set()
                    elif parsed.kind == MessageKind.ERROR and parsed.payload.error:
                        error = parsed.payload.error
                        print(f"[error] {error.message.strip()}\n")
                        response_event.set()
                    elif parsed.kind == MessageKind.HEARTBEAT:
                        continue
                    else:
                        print(f"[assistant]\n{response}\n")
                        response_event.set()
            except ConnectionClosedError as exc:
                if not receiver_stop.is_set():
                    print(f"[closed] {exc}")
            finally:
                receiver_stop.set()

        async def send_prompt(prompt: str) -> None:
            response_event.clear()
            message = create_text_message(
                role=MessageRole.USER,
                content=prompt,
                from_="client",
                to="server",
                message_id=str(uuid4()),
            )
            await ws.send(json.dumps(message.to_dict()))

        receiver_task = asyncio.create_task(receiver())

        async def wait_for_response() -> None:
            tasks = [
                asyncio.create_task(response_event.wait()),
                asyncio.create_task(receiver_stop.wait()),
            ]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

        try:
            if initial_prompt:
                await send_prompt(initial_prompt)
                await wait_for_response()
                return

            print("Connected. Enter natural language requests (Ctrl+C to exit).")
            while True:
                try:
                    prompt = await asyncio.to_thread(input, "You> ")
                except KeyboardInterrupt:
                    print("\nGoodbye!")
                    break
                except EOFError:
                    print("\nGoodbye!")
                    break

                prompt = prompt.strip()
                if not prompt:
                    continue

                if receiver_stop.is_set():
                    break

                try:
                    await send_prompt(prompt)
                except ConnectionClosedError:
                    break
                await wait_for_response()
        finally:
            receiver_stop.set()
            receiver_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await receiver_task


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Interactive websocket client for qwery-core.")
    parser.add_argument("--base-url", default="ws://localhost:8000", help="Base websocket URL")
    parser.add_argument("--project-id", required=True, help="Project identifier")
    parser.add_argument("--chat-id", help="Chat UUID (defaults to random UUID)")
    parser.add_argument("--prompt", help="Optional single prompt (non-interactive)")
    args = parser.parse_args(argv)

    chat_id = args.chat_id or str(uuid4())

    asyncio.run(
        _interactive_chat(
            base_url=args.base_url,
            project_id=args.project_id,
            chat_id=chat_id,
            initial_prompt=args.prompt,
        )
    )


if __name__ == "__main__":
    main()
