// Minimal Vega-Lite spec type for our use case. We intentionally keep this
// loose to avoid pulling in heavy type dependencies while still making the
// factory output explicit.
export interface VegaLiteSpec {
  [key: string]: unknown;
}

export type VegaChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'scatter'
  | 'histogram'
  | 'heatmap'
  | 'stacked_bar'
  | 'grouped_bar'
  | 'area'
  | 'donut';

export interface VegaChartInput {
  chartType: VegaChartType;
  title?: string;
  data: Array<Record<string, unknown>>;
  config: {
    colors: string[];
    labels?: Record<string, string>;
    xKey?: string;
    yKey?: string;
    seriesKey?: string;
    nameKey?: string;
    valueKey?: string;
  };
}
