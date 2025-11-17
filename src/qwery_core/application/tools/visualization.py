"""Data visualization tool for generating charts from query results."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable

import plotly.graph_objects as go

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
        
        # Extract column names and data
        # Data dict comes from agent.py with x_col and y_col as keys
        columns = list(data.keys())
        if len(columns) < 2:
            raise ValueError("Visualization requires at least 2 columns")
        
        # Use first two columns (x_col, y_col from agent)
        x_col = columns[0]
        y_col = columns[1]
        x_data = list(data[x_col])
        y_data = list(data[y_col])
        
        # Ensure data lengths match
        if len(x_data) != len(y_data):
            raise ValueError(f"X and Y data lengths don't match: {len(x_data)} vs {len(y_data)}")
        
        # Create figure using graph_objects (doesn't require pandas)
        fig = go.Figure()
        
        if chart_type == "line":
            fig.add_trace(go.Scatter(x=x_data, y=y_data, mode='lines+markers', name=y_col))
        elif chart_type == "scatter":
            fig.add_trace(go.Scatter(x=x_data, y=y_data, mode='markers', name=y_col))
        else:  # bar
            fig.add_trace(go.Bar(x=x_data, y=y_data, name=y_col))
        
        fig.update_layout(
            title=title,
            xaxis_title=x_col,
            yaxis_title=y_col,
        )
        
        logger.info(f"[VIZ_TOOL_FIG_CREATE] took={time.time() - fig_create_start:.4f}s")
        
        json_start = time.time()
        figure_json = json.loads(fig.to_json())
        logger.info(f"[VIZ_TOOL_JSON] took={time.time() - json_start:.4f}s, json_size={len(str(figure_json))}, total_took={time.time() - viz_start:.4f}s")
        return VisualizationResult(figure_json=figure_json)


__all__ = ["VisualizeDataTool", "VisualizationResult"]
