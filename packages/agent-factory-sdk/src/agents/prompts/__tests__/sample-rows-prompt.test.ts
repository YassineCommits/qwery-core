import { describe, it, expect } from 'vitest';
import { SELECT_CHART_TYPE_PROMPT } from '../select-chart-type.prompt';
import { GENERATE_CHART_CONFIG_PROMPT } from '../generate-chart-config.prompt';

describe('chart prompts sampleRowsJson', () => {
  it('includes sample rows when provided', () => {
    const sampleRowsJson = JSON.stringify([{ a: 1 }]);
    const select = SELECT_CHART_TYPE_PROMPT(
      'u',
      'sql',
      { columns: ['a'], rowCount: 1 },
      null,
      { sampleRowsJson },
    );
    expect(select).toContain('Sample rows (first N)');
    expect(select).toContain(sampleRowsJson);

    const gen = GENERATE_CHART_CONFIG_PROMPT(
      'bar',
      { columns: ['a'], rowCount: 1 },
      'sql',
      null,
      { sampleRowsJson },
    );
    expect(gen).toContain('Sample rows (first N)');
    expect(gen).toContain(sampleRowsJson);
  });
});
