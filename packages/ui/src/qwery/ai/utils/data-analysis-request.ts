'use client';

export const DATA_ANALYSIS_REQUEST_START = '__QWERY_DATA_ANALYSIS_REQUEST__';
export const DATA_ANALYSIS_REQUEST_END = '__QWERY_DATA_ANALYSIS_REQUEST_END__';

export const DATA_ANALYSIS_CONSENT_START = '__QWERY_DATA_ANALYSIS_CONSENT__';
export const DATA_ANALYSIS_CONSENT_END = '__QWERY_DATA_ANALYSIS_CONSENT_END__';

export type DataAnalysisRequest = {
  limit: number;
  scope: 'queryResults';
  reason?: string;
};

export type DataAnalysisConsent = {
  approved: boolean;
  limit?: number;
};

export function extractDataAnalysisRequests(text: string): {
  text: string;
  requests: DataAnalysisRequest[];
} {
  if (!text.includes(DATA_ANALYSIS_REQUEST_START)) {
    return { text, requests: [] };
  }

  const requests: DataAnalysisRequest[] = [];
  let output = '';
  let cursor = 0;

  while (true) {
    const start = text.indexOf(DATA_ANALYSIS_REQUEST_START, cursor);
    if (start === -1) {
      output += text.slice(cursor);
      break;
    }

    output += text.slice(cursor, start);
    const jsonStart = start + DATA_ANALYSIS_REQUEST_START.length;
    const end = text.indexOf(DATA_ANALYSIS_REQUEST_END, jsonStart);
    if (end === -1) {
      // malformed; keep rest as-is
      output += text.slice(start);
      break;
    }

    const rawJson = text.slice(jsonStart, end).trim();
    try {
      const parsed = JSON.parse(rawJson) as Partial<DataAnalysisRequest>;
      if (
        parsed &&
        parsed.scope === 'queryResults' &&
        typeof parsed.limit === 'number' &&
        Number.isFinite(parsed.limit) &&
        parsed.limit > 0
      ) {
        requests.push({
          scope: 'queryResults',
          limit: Math.floor(parsed.limit),
          reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
        });
        output += `__QWERY_DATA_ANALYSIS_REQUEST_PLACEHOLDER__${requests.length - 1}__`;
      } else {
        output += text.slice(start, end + DATA_ANALYSIS_REQUEST_END.length);
      }
    } catch {
      output += text.slice(start, end + DATA_ANALYSIS_REQUEST_END.length);
    }

    cursor = end + DATA_ANALYSIS_REQUEST_END.length;
  }

  return { text: output, requests };
}

export function extractDataAnalysisConsent(text: string): {
  text: string;
  consent?: DataAnalysisConsent;
} {
  if (!text.includes(DATA_ANALYSIS_CONSENT_START)) return { text };

  const start = text.indexOf(DATA_ANALYSIS_CONSENT_START);
  const jsonStart = start + DATA_ANALYSIS_CONSENT_START.length;
  const end = text.indexOf(DATA_ANALYSIS_CONSENT_END, jsonStart);
  if (end === -1) return { text };

  const rawJson = text.slice(jsonStart, end).trim();
  try {
    const parsed = JSON.parse(rawJson) as Partial<DataAnalysisConsent>;
    if (!parsed || typeof parsed.approved !== 'boolean') {
      return { text };
    }
    const cleanedText = (
      text.slice(0, start) + text.slice(end + DATA_ANALYSIS_CONSENT_END.length)
    ).trim();
    return {
      text: cleanedText,
      consent: {
        approved: parsed.approved,
        limit:
          typeof parsed.limit === 'number' && Number.isFinite(parsed.limit)
            ? Math.floor(parsed.limit)
            : undefined,
      },
    };
  } catch {
    return { text };
  }
}
