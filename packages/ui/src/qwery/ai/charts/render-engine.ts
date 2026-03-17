import type { ChartConfig } from './chart-renderer';

export type RenderEngine = 'recharts' | 'vega-lite';

export function decideRenderEngine(chartConfig: ChartConfig): RenderEngine {
  // Recharts components only exist for the original trio.
  // Everything else is rendered via Vega-Lite.
  switch (chartConfig.chartType) {
    case 'bar':
      return 'vega-lite';
    case 'line':
    case 'pie':
      return 'recharts';
    default:
      return 'vega-lite';
  }
}
