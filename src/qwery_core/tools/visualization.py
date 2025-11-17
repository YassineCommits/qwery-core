"""Data visualization tool for generating charts from query results."""

from __future__ import annotations

import json
from collections.abc import Iterable as IterableABC
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Sequence

import plotly.graph_objects as go


@dataclass(slots=True)
class VisualizationResult:
    figure_json: Dict[str, Any]


class VisualizeDataTool:
    name = "visualize_data"

    def __init__(self, file_system) -> None:
        self.file_system = file_system

    async def execute(
        self,
        data: Dict[str, Iterable[Any]],
        chart_type: str = "bar",
        title: str = "Visualization",
    ) -> VisualizationResult:
        columns = list(data.keys())
        if len(columns) < 2:
            raise ValueError("Visualization data must include at least two columns")

        x_key, y_key = columns[:2]
        x_values = _normalize_series(data[x_key])
        y_values = _normalize_series(data[y_key])

        if len(x_values) != len(y_values):
            raise ValueError("Visualization data columns must have the same length")

        fig = go.Figure()
        chart_type = (chart_type or "bar").lower()

        if chart_type == "line":
            fig.add_trace(go.Scatter(x=x_values, y=y_values, mode="lines", name=y_key))
        elif chart_type == "scatter":
            fig.add_trace(go.Scatter(x=x_values, y=y_values, mode="markers", name=y_key))
        else:
            fig.add_trace(go.Bar(x=x_values, y=y_values, name=y_key))

        fig.update_layout(title=title, xaxis_title=x_key, yaxis_title=y_key)

        figure_json = json.loads(fig.to_json())
        return VisualizationResult(figure_json=figure_json)


def _normalize_series(values: Iterable[Any]) -> Sequence[Any]:
    if isinstance(values, (str, bytes)):
        return [values]
    if isinstance(values, Sequence):
        return list(values)
    if isinstance(values, IterableABC):
        return list(values)
    return [values]


__all__ = ["VisualizeDataTool", "VisualizationResult"]
