import type { SemanticModel } from '@qwery/domain/entities';
import type { LogicalPlan } from '../semantic/logical-plan.type';

/**
 * Query Execution Trace
 * Provides full transparency into how a query was processed
 */
export interface QueryExecutionTrace {
  // Input
  userQuery: string;
  timestamp: Date;

  // Step 1: Intent Detection
  intentDetection: {
    method: 'keyword' | 'llm';
    intent: string;
    needsSQL: boolean;
    needsChart: boolean;
    complexity: string;
    keywordPattern?: string;
  };

  // Step 2: Schema Retrieval
  schemaRetrieval?: {
    tablesFound: string[];
    columnsFound: string[];
    ragDocumentsRetrieved: number;
    schemaVersion?: string;
  };

  // Step 3: Semantic Interpretation
  semanticInterpretation?: {
    metricsIdentified: string[];
    dimensionsIdentified: string[];
    filtersApplied: string[];
    joinsRequired: string[];
  };

  // Step 4: Logical Plan
  logicalPlan?: {
    projections: Array<{ type: string; name: string; alias?: string }>;
    tables: string[];
    joins: Array<{ table: string; condition: string; type: string }>;
    filters: Array<{ column: string; operator: string; value: unknown }>;
    groupBy: string[];
    orderBy: Array<{ column: string; direction: string }>;
    limit?: number;
    hasAggregation: boolean;
    complexity: string;
    confidence: number;
  };

  // Step 5: SQL Generation
  sqlGeneration?: {
    generatedSQL: string;
    wasRewritten: boolean;
    pathMappings?: Record<string, string>;
  };

  // Step 6: Execution
  execution?: {
    cacheHit: boolean;
    executionTimeMs: number;
    rowCount: number;
    columnCount: number;
    validationErrors: string[];
    validationWarnings: string[];
  };

  // Step 7: Result Summary
  resultSummary?: {
    naturalLanguageSummary: string;
    keyInsights: string[];
  };

  // LLM Usage Tracking
  llmUsage: {
    totalCalls: number;
    callDetails: Array<{
      purpose: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    }>;
  };

  // Performance
  totalLatencyMs: number;
}

/**
 * Query Explainer Service
 * Generates detailed traces of query execution for analyst trust
 */
export class QueryExplainerService {
  /**
   * Create a new execution trace
   */
  createTrace(userQuery: string): QueryExecutionTrace {
    return {
      userQuery,
      timestamp: new Date(),
      intentDetection: {
        method: 'keyword',
        intent: 'unknown',
        needsSQL: false,
        needsChart: false,
        complexity: 'unknown',
      },
      llmUsage: {
        totalCalls: 0,
        callDetails: [],
      },
      totalLatencyMs: 0,
    };
  }

  /**
   * Record intent detection step
   */
  recordIntentDetection(
    trace: QueryExecutionTrace,
    params: {
      method: 'keyword' | 'llm';
      intent: string;
      needsSQL: boolean;
      needsChart: boolean;
      complexity: string;
      keywordPattern?: string;
      llmModel?: string;
      llmTokens?: { input: number; output: number };
    },
  ): void {
    trace.intentDetection = {
      method: params.method,
      intent: params.intent,
      needsSQL: params.needsSQL,
      needsChart: params.needsChart,
      complexity: params.complexity,
      keywordPattern: params.keywordPattern,
    };

    if (params.method === 'llm') {
      trace.llmUsage.totalCalls++;
      trace.llmUsage.callDetails.push({
        purpose: 'intent_detection',
        model: params.llmModel,
        inputTokens: params.llmTokens?.input,
        outputTokens: params.llmTokens?.output,
      });
    }
  }

  /**
   * Record schema retrieval step
   */
  recordSchemaRetrieval(
    trace: QueryExecutionTrace,
    params: {
      tablesFound: string[];
      columnsFound: string[];
      ragDocumentsRetrieved: number;
      schemaVersion?: string;
    },
  ): void {
    trace.schemaRetrieval = params;
  }

  /**
   * Record semantic interpretation step
   */
  recordSemanticInterpretation(
    trace: QueryExecutionTrace,
    model: SemanticModel,
    params: {
      metricsIdentified: string[];
      dimensionsIdentified: string[];
      filtersApplied: string[];
      joinsRequired: string[];
    },
  ): void {
    trace.semanticInterpretation = params;
  }

  /**
   * Record logical plan step
   */
  recordLogicalPlan(trace: QueryExecutionTrace, plan: LogicalPlan): void {
    trace.logicalPlan = {
      projections: plan.projections.map((p) => ({
        type: p.type,
        name: p.name,
        alias: p.alias,
      })),
      tables: plan.tables,
      joins: plan.joins.map((j) => ({
        table: j.table,
        condition: j.condition,
        type: j.type,
      })),
      filters: plan.filters.map((f) => ({
        column: f.column,
        operator: f.operator,
        value: f.value,
      })),
      groupBy: plan.groupBy,
      orderBy: plan.orderBy.map((o) => ({
        column: o.column,
        direction: o.direction,
      })),
      limit: plan.limit,
      hasAggregation: plan.hasAggregation,
      complexity: plan.complexity,
      confidence: plan.confidence,
    };
  }

  /**
   * Record SQL generation step
   */
  recordSQLGeneration(
    trace: QueryExecutionTrace,
    params: {
      generatedSQL: string;
      wasRewritten: boolean;
      pathMappings?: Map<string, string>;
    },
  ): void {
    trace.sqlGeneration = {
      generatedSQL: params.generatedSQL,
      wasRewritten: params.wasRewritten,
      pathMappings: params.pathMappings
        ? Object.fromEntries(params.pathMappings)
        : undefined,
    };
  }

  /**
   * Record execution step
   */
  recordExecution(
    trace: QueryExecutionTrace,
    params: {
      cacheHit: boolean;
      executionTimeMs: number;
      rowCount: number;
      columnCount: number;
      validationErrors: string[];
      validationWarnings: string[];
    },
  ): void {
    trace.execution = params;
  }

  /**
   * Record result summary (may use LLM)
   */
  recordResultSummary(
    trace: QueryExecutionTrace,
    params: {
      naturalLanguageSummary: string;
      keyInsights: string[];
      llmModel?: string;
      llmTokens?: { input: number; output: number };
    },
  ): void {
    trace.resultSummary = {
      naturalLanguageSummary: params.naturalLanguageSummary,
      keyInsights: params.keyInsights,
    };

    if (params.llmModel) {
      trace.llmUsage.totalCalls++;
      trace.llmUsage.callDetails.push({
        purpose: 'result_summary',
        model: params.llmModel,
        inputTokens: params.llmTokens?.input,
        outputTokens: params.llmTokens?.output,
      });
    }
  }

  /**
   * Finalize the trace with total latency
   */
  finalizeTrace(trace: QueryExecutionTrace, totalLatencyMs: number): void {
    trace.totalLatencyMs = totalLatencyMs;
  }

  /**
   * Format trace as human-readable text
   */
  formatTraceAsText(trace: QueryExecutionTrace): string {
    const lines: string[] = [];

    lines.push(
      '═══════════════════════════════════════════════════════════════',
    );
    lines.push('                    QUERY EXECUTION TRACE');
    lines.push(
      '═══════════════════════════════════════════════════════════════',
    );
    lines.push('');
    lines.push(`📝 User Query: "${trace.userQuery}"`);
    lines.push(`⏱️  Timestamp: ${trace.timestamp.toISOString()}`);
    lines.push('');

    // Step 1: Intent Detection
    lines.push(
      '┌─────────────────────────────────────────────────────────────┐',
    );
    lines.push(
      '│ Step 1: Intent Detection                                    │',
    );
    lines.push(
      '├─────────────────────────────────────────────────────────────┤',
    );
    lines.push(`│ Method: ${trace.intentDetection.method.toUpperCase()}`);
    lines.push(`│ Intent: ${trace.intentDetection.intent}`);
    lines.push(`│ Needs SQL: ${trace.intentDetection.needsSQL}`);
    lines.push(`│ Needs Chart: ${trace.intentDetection.needsChart}`);
    lines.push(`│ Complexity: ${trace.intentDetection.complexity}`);
    if (trace.intentDetection.keywordPattern) {
      lines.push(`│ Matched Pattern: ${trace.intentDetection.keywordPattern}`);
    }
    lines.push(
      '└─────────────────────────────────────────────────────────────┘',
    );
    lines.push('');

    // Step 2: Schema Retrieval
    if (trace.schemaRetrieval) {
      lines.push(
        '┌─────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│ Step 2: Schema Retrieval                                    │',
      );
      lines.push(
        '├─────────────────────────────────────────────────────────────┤',
      );
      lines.push(
        `│ Tables Found: ${trace.schemaRetrieval.tablesFound.join(', ') || '(none)'}`,
      );
      lines.push(
        `│ Columns Found: ${trace.schemaRetrieval.columnsFound.length} columns`,
      );
      lines.push(
        `│ RAG Documents: ${trace.schemaRetrieval.ragDocumentsRetrieved}`,
      );
      lines.push(
        '└─────────────────────────────────────────────────────────────┘',
      );
      lines.push('');
    }

    // Step 3: Semantic Interpretation
    if (trace.semanticInterpretation) {
      lines.push(
        '┌─────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│ Step 3: Semantic Interpretation                             │',
      );
      lines.push(
        '├─────────────────────────────────────────────────────────────┤',
      );
      lines.push(
        `│ Metrics: ${trace.semanticInterpretation.metricsIdentified.join(', ') || '(none)'}`,
      );
      lines.push(
        `│ Dimensions: ${trace.semanticInterpretation.dimensionsIdentified.join(', ') || '(none)'}`,
      );
      lines.push(
        `│ Filters: ${trace.semanticInterpretation.filtersApplied.join(', ') || '(none)'}`,
      );
      lines.push(
        `│ Joins: ${trace.semanticInterpretation.joinsRequired.join(', ') || '(none)'}`,
      );
      lines.push(
        '└─────────────────────────────────────────────────────────────┘',
      );
      lines.push('');
    }

    // Step 4: Logical Plan
    if (trace.logicalPlan) {
      lines.push(
        '┌─────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│ Step 4: Logical Plan                                        │',
      );
      lines.push(
        '├─────────────────────────────────────────────────────────────┤',
      );
      lines.push(`│ Tables: ${trace.logicalPlan.tables.join(', ')}`);
      lines.push(
        `│ Projections: ${trace.logicalPlan.projections.map((p) => p.alias || p.name).join(', ')}`,
      );
      if (trace.logicalPlan.joins.length > 0) {
        lines.push(
          `│ Joins: ${trace.logicalPlan.joins.map((j) => `${j.type.toUpperCase()} ${j.table}`).join(', ')}`,
        );
      }
      if (trace.logicalPlan.groupBy.length > 0) {
        lines.push(`│ Group By: ${trace.logicalPlan.groupBy.join(', ')}`);
      }
      lines.push(
        `│ Aggregation: ${trace.logicalPlan.hasAggregation ? 'YES' : 'NO'}`,
      );
      lines.push(`│ Complexity: ${trace.logicalPlan.complexity}`);
      lines.push(
        `│ Confidence: ${(trace.logicalPlan.confidence * 100).toFixed(0)}%`,
      );
      lines.push(
        '└─────────────────────────────────────────────────────────────┘',
      );
      lines.push('');
    }

    // Step 5: SQL Generation
    if (trace.sqlGeneration) {
      lines.push(
        '┌─────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│ Step 5: SQL Generation                                      │',
      );
      lines.push(
        '├─────────────────────────────────────────────────────────────┤',
      );
      lines.push(
        `│ Rewritten: ${trace.sqlGeneration.wasRewritten ? 'YES' : 'NO'}`,
      );
      lines.push('│ SQL:');
      trace.sqlGeneration.generatedSQL.split('\n').forEach((line) => {
        lines.push(`│   ${line}`);
      });
      lines.push(
        '└─────────────────────────────────────────────────────────────┘',
      );
      lines.push('');
    }

    // Step 6: Execution
    if (trace.execution) {
      lines.push(
        '┌─────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│ Step 6: Execution                                           │',
      );
      lines.push(
        '├─────────────────────────────────────────────────────────────┤',
      );
      lines.push(
        `│ Cache Hit: ${trace.execution.cacheHit ? 'YES ✓' : 'NO (fresh execution)'}`,
      );
      lines.push(
        `│ Execution Time: ${trace.execution.executionTimeMs.toFixed(2)}ms`,
      );
      lines.push(
        `│ Results: ${trace.execution.rowCount} rows × ${trace.execution.columnCount} columns`,
      );
      if (trace.execution.validationWarnings.length > 0) {
        lines.push(
          `│ Warnings: ${trace.execution.validationWarnings.join(', ')}`,
        );
      }
      lines.push(
        '└─────────────────────────────────────────────────────────────┘',
      );
      lines.push('');
    }

    // Step 7: Result Summary
    if (trace.resultSummary) {
      lines.push(
        '┌─────────────────────────────────────────────────────────────┐',
      );
      lines.push(
        '│ Step 7: Result Summary                                      │',
      );
      lines.push(
        '├─────────────────────────────────────────────────────────────┤',
      );
      lines.push(`│ ${trace.resultSummary.naturalLanguageSummary}`);
      if (trace.resultSummary.keyInsights.length > 0) {
        lines.push('│ Key Insights:');
        trace.resultSummary.keyInsights.forEach((insight) => {
          lines.push(`│   • ${insight}`);
        });
      }
      lines.push(
        '└─────────────────────────────────────────────────────────────┘',
      );
      lines.push('');
    }

    // LLM Usage Summary
    lines.push(
      '┌─────────────────────────────────────────────────────────────┐',
    );
    lines.push(
      '│ LLM Usage Summary                                           │',
    );
    lines.push(
      '├─────────────────────────────────────────────────────────────┤',
    );
    lines.push(`│ Total LLM Calls: ${trace.llmUsage.totalCalls}`);
    if (trace.llmUsage.callDetails.length > 0) {
      trace.llmUsage.callDetails.forEach((call) => {
        lines.push(
          `│   • ${call.purpose}: ${call.model || 'unknown'} (${call.inputTokens || 0} → ${call.outputTokens || 0} tokens)`,
        );
      });
    } else {
      lines.push('│   (No LLM calls - fully deterministic)');
    }
    lines.push(
      '└─────────────────────────────────────────────────────────────┘',
    );
    lines.push('');

    // Final summary
    lines.push(
      '═══════════════════════════════════════════════════════════════',
    );
    lines.push(`Total Latency: ${trace.totalLatencyMs.toFixed(2)}ms`);
    lines.push(
      '═══════════════════════════════════════════════════════════════',
    );

    return lines.join('\n');
  }

  /**
   * Format trace as JSON
   */
  formatTraceAsJSON(trace: QueryExecutionTrace): string {
    return JSON.stringify(trace, null, 2);
  }
}

export const queryExplainer = new QueryExplainerService();
