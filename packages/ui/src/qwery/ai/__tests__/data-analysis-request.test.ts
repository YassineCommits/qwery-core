import { describe, it, expect } from 'vitest';
import { extractDataAnalysisRequests } from '../utils/data-analysis-request';

describe('extractDataAnalysisRequests', () => {
  it('extracts request and replaces with placeholder', () => {
    const input =
      'Hello __QWERY_DATA_ANALYSIS_REQUEST__{"limit":25,"scope":"queryResults","reason":"dist"}__QWERY_DATA_ANALYSIS_REQUEST_END__ world';
    const result = extractDataAnalysisRequests(input);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.limit).toBe(25);
    expect(result.text).toContain(
      '__QWERY_DATA_ANALYSIS_REQUEST_PLACEHOLDER__0__',
    );
  });
});
