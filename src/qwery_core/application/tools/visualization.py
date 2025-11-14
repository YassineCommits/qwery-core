"""Data visualization tool for generating charts from query results."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable

import plotly.express as px


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
        if chart_type == "line":
            fig = px.line(data, title=title)
        elif chart_type == "scatter":
            fig = px.scatter(data, title=title)
        else:
            fig = px.bar(data, title=title)

        figure_json = json.loads(fig.to_json())
        return VisualizationResult(figure_json=figure_json)


__all__ = ["VisualizeDataTool", "VisualizationResult"]
