#!/usr/bin/env python3
"""Detailed streaming test with event parsing."""

import json
import sys
import time
from typing import Dict, Any

import requests


def test_streaming(base_url: str, prompt: str) -> None:
    """Test HTTP streaming endpoint."""
    url = f"{base_url}/api/v1/projects/test-project/test-chat/messages/stream"
    
    print(f"Streaming to: {url}")
    print(f"Prompt: {prompt}")
    print("=" * 60)
    print()
    
    start_time = time.time()
    
    try:
        response = requests.post(
            url,
            json={"prompt": prompt},
            headers={"Content-Type": "application/json"},
            stream=True,
            timeout=60,
        )
        response.raise_for_status()
        
        events_received = {
            "start": False,
            "answer": False,
            "toon": False,
            "done": False,
        }
        
        for line in response.iter_lines():
            if not line:
                continue
            
            line_str = line.decode("utf-8")
            if not line_str.startswith("data: "):
                continue
            
            try:
                data_str = line_str[6:]  # Remove "data: " prefix
                event_data: Dict[str, Any] = json.loads(data_str)
                event_type = event_data.get("type")
                
                if event_type == "start":
                    events_received["start"] = True
                    print("▶ Stream started")
                
                elif event_type == "answer":
                    events_received["answer"] = True
                    content = event_data.get("content", "")
                    print(f"💬 Human Answer:")
                    print(f"   {content}")
                    print()
                
                elif event_type == "toon":
                    events_received["toon"] = True
                    content = event_data.get("content", "")
                    print("📊 TOON Data:")
                    print("```toon")
                    print(content)
                    print("```")
                    print()
                
                elif event_type == "done":
                    events_received["done"] = True
                    elapsed = time.time() - start_time
                    print(f"✅ Stream complete (took {elapsed:.2f}s)")
                
                elif event_type == "error":
                    print(f"❌ Error: {event_data.get('message', 'Unknown error')}")
                
            except json.JSONDecodeError:
                print(f"⚠ Could not parse: {line_str}")
        
        print()
        print("=" * 60)
        print("Event Summary:")
        for event, received in events_received.items():
            status = "✓" if received else "✗"
            print(f"  {status} {event}")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "list all my tables"
    
    test_streaming(base_url, prompt)

