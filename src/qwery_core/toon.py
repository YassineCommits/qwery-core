"""TOON (Token-Oriented Object Notation) encoder for query results."""

from __future__ import annotations

from typing import Any


def _escape_toon_string(value: Any) -> str:
    """Escape a value for TOON format."""
    if value is None:
        return "null"
    
    if isinstance(value, bool):
        return "true" if value else "false"
    
    str_value = str(value)
    
    # Check if we need quoting (contains comma, newline, or special chars)
    needs_quoting = (
        "," in str_value
        or "\n" in str_value
        or "\r" in str_value
        or str_value.strip() != str_value
        or (str_value.startswith(('"', "'")) and str_value.endswith(('"', "'")))
        or str_value == ""
    )
    
    if needs_quoting:
        # Escape quotes and wrap in double quotes
        escaped = str_value.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
    
    return str_value


def encode_query_results(sql: str, columns: list[str], rows: list[tuple[Any, ...]]) -> str:
    """
    Encode SQL query and results in TOON format.
    
    Args:
        sql: The SQL query string
        columns: List of column names
        rows: List of row tuples
    
    Returns:
        TOON-formatted string
    """
    lines = []
    
    # Encode the SQL query
    lines.append(f"query: {_escape_toon_string(sql)}")
    
    # Encode results as tabular array
    if columns and rows:
        num_rows = len(rows)
        col_names = ",".join(columns)
        lines.append(f"results[{num_rows}]{{{col_names}}}:")
        
        for row in rows:
            # Convert row values to strings and escape if needed
            row_values = [_escape_toon_string(val) for val in row]
            lines.append(f"  {','.join(row_values)}")
    else:
        lines.append("results[0]:")
    
    return "\n".join(lines)

