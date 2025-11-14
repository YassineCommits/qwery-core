"""Data visualization tool for generating charts from query results."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable

import plotly.express as px

logger = logging.getLogger(__name__)


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
        viz_start = time.time()
        data_size = sum(len(v) if hasattr(v, '__len__') else 0 for v in data.values())
        logger.info(f"[VIZ_TOOL_EXEC_START] chart_type={chart_type}, title={title}, data_size={data_size}, timestamp={viz_start}")
        
        fig_create_start = time.time()
        if chart_type == "line":
            fig = px.line(data, title=title)
        elif chart_type == "scatter":
            fig = px.scatter(data, title=title)
        else:
            fig = px.bar(data, title=title)
        logger.info(f"[VIZ_TOOL_FIG_CREATE] took={time.time() - fig_create_start:.4f}s")
        
        json_start = time.time()
        figure_json = json.loads(fig.to_json())
        logger.info(f"[VIZ_TOOL_JSON] took={time.time() - json_start:.4f}s, json_size={len(str(figure_json))}, total_took={time.time() - viz_start:.4f}s")
        return VisualizationResult(figure_json=figure_json)


__all__ = ["VisualizeDataTool", "VisualizationResult"]
