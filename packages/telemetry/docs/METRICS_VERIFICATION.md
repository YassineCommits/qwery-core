# Metrics Pipeline Verification Guide

## Overview

This guide helps verify that metrics are being recorded and exported correctly to ClickHouse for billing purposes.

## Debug Mode

Enable debug mode to see detailed logging:

```bash
export QWERY_TELEMETRY_DEBUG=true
```

This will log:
- When metrics are recorded (token usage, query metrics)
- Metric values and attributes
- Export attempts and results
- Any errors during export

## Verification Steps

### 1. Check Metrics Are Being Recorded

With `QWERY_TELEMETRY_DEBUG=true`, you should see logs like:

```
[Telemetry] Recording agent token usage: {
  promptTokens: 100,
  completionTokens: 50,
  total: 150,
  attributes: {...},
  timestamp: '2026-01-09T...'
}
```

### 2. Check Metrics Export Status

Look for these log messages:

- `[Telemetry] Using OTLP MetricExporter for metrics (endpoint: ...)` - Metrics export enabled
- `[Telemetry] OTLP Metrics export connection established successfully.` - Export working
- `[Telemetry] Metrics export not supported by collector` - Collector doesn't support metrics (12 UNIMPLEMENTED)
- `[Telemetry] Metrics export failed` - Export errors (check collector)

### 3. Verify Metrics in ClickHouse

#### Check Token Usage Metrics

```sql
-- Check all token usage metrics
SELECT 
    MetricName,
    sum(Value) as total_tokens,
    count() as record_count,
    min(TimeUnix) as first_seen,
    max(TimeUnix) as last_seen
FROM otel_metrics_sum
WHERE MetricName IN (
    'ai.tokens.prompt',
    'ai.tokens.completion',
    'ai.tokens.total'
)
GROUP BY MetricName
ORDER BY MetricName;
```

#### Check Query Metrics

```sql
-- Check query metrics
SELECT 
    MetricName,
    sum(Value) as total_value,
    count() as record_count,
    max(TimeUnix) as last_seen
FROM otel_metrics_sum
WHERE MetricName IN (
    'cli.query.count'
)
GROUP BY MetricName;

-- Check query duration (histogram)
SELECT 
    MetricName,
    count() as record_count,
    avg(Sum) as avg_duration_ms,
    max(TimeUnix) as last_seen
FROM otel_metrics_histogram
WHERE MetricName = 'cli.query.duration'
GROUP BY MetricName;
```

#### Check Recent Metrics (Last Hour)

```sql
-- Recent token usage
SELECT 
    MetricName,
    sum(Value) as total_tokens,
    count() as record_count,
    max(TimeUnix) as last_seen
FROM otel_metrics_sum
WHERE MetricName IN ('ai.tokens.prompt', 'ai.tokens.completion', 'ai.tokens.total')
  AND TimeUnix >= now() - INTERVAL 1 HOUR
GROUP BY MetricName
ORDER BY last_seen DESC;
```

#### Check Metrics by Service/App Type

```sql
-- Token usage by service
SELECT 
    ServiceName,
    MetricName,
    sum(Value) as total_tokens,
    count() as record_count
FROM otel_metrics_sum
WHERE MetricName IN ('ai.tokens.prompt', 'ai.tokens.completion', 'ai.tokens.total')
GROUP BY ServiceName, MetricName
ORDER BY ServiceName, MetricName;
```

#### Check Metrics with Attributes

```sql
-- Token usage with model information
SELECT 
    MetricName,
    Attributes['agent.llm.model.name'] as model,
    sum(Value) as total_tokens,
    count() as record_count
FROM otel_metrics_sum
WHERE MetricName IN ('ai.tokens.prompt', 'ai.tokens.completion', 'ai.tokens.total')
  AND Attributes['agent.llm.model.name'] != ''
GROUP BY MetricName, model
ORDER BY MetricName, total_tokens DESC;
```

## Troubleshooting

### No Metrics in ClickHouse

1. **Check if metrics are being recorded:**
   - Enable `QWERY_TELEMETRY_DEBUG=true`
   - Look for `[Telemetry] Recording agent token usage` logs
   - If no logs, metrics aren't being recorded

2. **Check if metrics export is enabled:**
   - Look for `[Telemetry] Using OTLP MetricExporter` log
   - Check `QWERY_EXPORT_METRICS=true` is set

3. **Check collector configuration:**
   - Verify metrics pipeline is configured in collector
   - Check collector logs for errors
   - Verify collector is receiving metrics on port 4317

4. **Check export errors:**
   - Look for `[Telemetry] Metrics export failed` warnings
   - Check for `12 UNIMPLEMENTED` errors (collector doesn't support metrics)
   - Check network connectivity to collector

### Metrics Export Failing

If you see `12 UNIMPLEMENTED` errors:

1. **Option 1: Disable metrics export** (use span → metrics instead):
   ```bash
   export QWERY_EXPORT_METRICS=false
   ```

2. **Option 2: Fix collector** (add metrics service support):
   - Update collector configuration
   - Ensure metrics pipeline is properly configured
   - Restart collector

3. **Option 3: Use console exporter for debugging:**
   ```bash
   export QWERY_TELEMETRY_DEBUG=true
   ```
   This will use ConsoleMetricExporter and show metrics in logs.

### Data Loss Prevention

The current implementation includes:

1. **Validation**: Token values are validated before recording (no negative values)
2. **Error Handling**: Export errors are caught and logged (metrics still collected)
3. **Fallback**: Console exporter used if OTLP export fails (in debug mode)
4. **Logging**: All metric recordings are logged (in debug mode)

## Billing Accuracy

For billing, ensure:

1. ✅ All token usage is recorded (check logs with `QWERY_TELEMETRY_DEBUG=true`)
2. ✅ Metrics are exported successfully (check for export success logs)
3. ✅ Metrics appear in ClickHouse (run verification queries)
4. ✅ No duplicate counting (check record counts match expected)
5. ✅ Attributes are correct (model, conversation, etc.)

## Next Steps

1. Enable debug mode: `export QWERY_TELEMETRY_DEBUG=true`
2. Run some agent interactions or queries
3. Check logs for metric recordings
4. Wait 5-10 seconds for export interval
5. Query ClickHouse to verify metrics arrived
6. Compare totals with expected values

