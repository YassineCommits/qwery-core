export type DataAnalysisConfig = {
  enabled: boolean;
  rowLimit: number;
};

export function getDataAnalysisConfig(): DataAnalysisConfig {
  const enabledRaw =
    typeof process !== 'undefined'
      ? (process.env.QWERY_LLM_DATA_ANALYSIS_ENABLED ?? '')
      : '';
  const enabled = enabledRaw === 'true';

  const limitRaw =
    typeof process !== 'undefined'
      ? (process.env.QWERY_LLM_DATA_ANALYSIS_ROW_LIMIT ?? '')
      : '';
  const parsed = Number(limitRaw);
  const rowLimit =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 25;

  return { enabled, rowLimit };
}
