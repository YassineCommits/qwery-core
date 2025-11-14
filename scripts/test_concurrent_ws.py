#!/usr/bin/env python3
"""Test concurrent WebSocket connections."""

import asyncio
import json
import sys
from typing import List

import websockets


async def test_connection(uri: str, project_id: str, chat_id: str, connection_id: int) -> None:
    """Test a single WebSocket connection."""
    try:
        async with websockets.connect(f"{uri}/ws/agent/{project_id}/{chat_id}") as websocket:
            # Wait for handshake
            handshake = await websocket.recv()
            print(f"[Connection {connection_id}] Connected, received: {json.loads(handshake)['kind']}")
            
            # Send a test message
            message = {
                "id": f"test-{connection_id}",
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
            await websocket.send(json.dumps(message))
            
            # Wait for response
            response = await websocket.recv()
            data = json.loads(response)
            print(f"[Connection {connection_id}] Received response: {data.get('kind', 'unknown')}")
            
            # Keep connection alive for a bit
            await asyncio.sleep(2)
            
    except Exception as e:
        print(f"[Connection {connection_id}] Error: {e}")


async def test_concurrent_connections(count: int = 10) -> None:
    """Test multiple concurrent WebSocket connections."""
    base_url = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:8000"
    
    print(f"Testing {count} concurrent WebSocket connections to {base_url}")
    print("=" * 60)
    
    tasks: List[asyncio.Task] = []
    for i in range(count):
        project_id = f"test-project-{i % 5}"  # 5 different projects
        chat_id = f"test-chat-{i}"
        task = asyncio.create_task(
            test_connection(base_url, project_id, chat_id, i)
        )
        tasks.append(task)
        # Stagger connections slightly
        await asyncio.sleep(0.1)
    
    # Wait for all connections
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    successful = sum(1 for r in results if not isinstance(r, Exception))
    failed = sum(1 for r in results if isinstance(r, Exception))
    
    print("=" * 60)
    print(f"Results: {successful} successful, {failed} failed")


if __name__ == "__main__":
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    asyncio.run(test_concurrent_connections(count))

