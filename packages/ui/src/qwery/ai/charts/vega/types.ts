import type { ChartConfig } from '../chart-renderer';

export type { ChartConfig };

// Minimal Vega-Lite spec type for our use case. We intentionally keep this
// loose to avoid pulling in heavy type dependencies while still making the
// factory output explicit.
export interface VegaLiteSpec {
  [key: string]: unknown;
}
