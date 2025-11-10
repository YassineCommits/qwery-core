from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path
from typing import Iterable, Tuple

TRACKS: Iterable[Tuple[str, int, int]] = [
    ("Flight of Icarus", 215000, 3560000),
    ("Galactic Drift", 198000, 2890000),
    ("Neon Skyline", 175000, 2430000),
    ("Analog Dreams", 162000, 2100000),
    ("Echoes of Dawn", 149000, 1980000),
]


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            milliseconds INTEGER NOT NULL,
            bytes INTEGER NOT NULL
        )
        """
    )


def populate_tracks(connection: sqlite3.Connection) -> None:
    existing = connection.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
    if existing:
        return
    connection.executemany(
        "INSERT INTO tracks (name, milliseconds, bytes) VALUES (?, ?, ?)",
        TRACKS,
    )


def bootstrap(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    try:
        ensure_schema(connection)
        populate_tracks(connection)
        connection.commit()
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap demo SQLite database for Qwery Core")
    parser.add_argument(
        "--path",
        type=Path,
        default=Path("./data/chinook_demo.sqlite"),
        help="Location of the SQLite database to create/populate",
    )
    args = parser.parse_args()
    bootstrap(args.path)
    print(f"Database ready at {args.path}")


if __name__ == "__main__":
    main()

