import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveModel } from '../model-resolver';
import type {
  EntityClass,
  Metric,
  SemanticRelationship,
} from '@qwery/domain/entities';
import {
  createEntityClass,
  createMetric,
  createSemanticRelationship,
} from '@qwery/domain/entities';
import type {
  TableAnalysis,
  DetectedRelationship,
} from './schema-analyzer.service';

/**
 * Semantic LLM Service
 * Provides LLM-assisted inference for ambiguous cases
 * Only called when deterministic methods have low confidence
 */
export class SemanticLLMService {
  private model = 'azure/gpt-5-mini';
  private confidenceThreshold = 0.7;

  /**
   * Set the minimum confidence threshold for using LLM fallback
   */
  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = threshold;
  }

  /**
   * Check if LLM fallback should be used based on confidence
   */
  shouldUseLLM(confidence: number): boolean {
    return confidence < this.confidenceThreshold;
  }

  /**
   * Infer relationship between tables when deterministic methods are ambiguous
   */
  async inferRelationship(
    fromTable: TableAnalysis,
    toTable: TableAnalysis,
    candidates: DetectedRelationship[],
  ): Promise<SemanticRelationship | null> {
    if (candidates.length === 0) return null;
    if (
      candidates.length === 1 &&
      candidates[0]!.confidence >= this.confidenceThreshold
    ) {
      const c = candidates[0]!;
      return createSemanticRelationship({
        fromEntity: c.fromTable,
        toEntity: c.toTable,
        fromColumn: c.fromColumn,
        toColumn: c.toColumn,
        cardinality: c.cardinality,
        confidence: c.confidence,
        inferenceMethod: 'schema',
      });
    }

    try {
      const { object } = await generateObject({
        model: await resolveModel(this.model),
        schema: z.object({
          selectedIndex: z
            .number()
            .describe('Index of the best candidate (0-based)'),
          relationshipType: z.enum([
            'is_a',
            'part_of',
            'has_a',
            'references',
            'aggregates',
          ]),
          cardinality: z.enum([
            'one_to_one',
            'one_to_many',
            'many_to_one',
            'many_to_many',
          ]),
          reasoning: z.string().describe('Brief explanation'),
        }),
        prompt: `Given these tables and relationship candidates, select the most appropriate relationship:

FROM TABLE: ${fromTable.tableName}
Columns: ${fromTable.columns.map((c) => `${c.columnName} (${c.columnType})`).join(', ')}

TO TABLE: ${toTable.tableName}
Columns: ${toTable.columns.map((c) => `${c.columnName} (${c.columnType})`).join(', ')}

CANDIDATES:
${candidates.map((c, i) => `${i}: ${c.fromColumn} -> ${c.toColumn} (confidence: ${c.confidence})`).join('\n')}

Select the best relationship and classify it.`,
      });

      const selected = candidates[object.selectedIndex];
      if (!selected) return null;

      return createSemanticRelationship({
        fromEntity: selected.fromTable,
        toEntity: selected.toTable,
        fromColumn: selected.fromColumn,
        toColumn: selected.toColumn,
        type: object.relationshipType,
        cardinality: object.cardinality,
        confidence: 0.8,
        inferenceMethod: 'llm',
      });
    } catch {
      // Fallback to first candidate if LLM fails
      const first = candidates[0];
      if (!first) return null;
      return createSemanticRelationship({
        fromEntity: first.fromTable,
        toEntity: first.toTable,
        fromColumn: first.fromColumn,
        toColumn: first.toColumn,
        cardinality: first.cardinality,
        confidence: first.confidence,
        inferenceMethod: 'schema',
      });
    }
  }

  /**
   * Classify a table's domain using LLM when uncertain
   */
  async classifyTable(table: TableAnalysis): Promise<EntityClass> {
    try {
      const { object } = await generateObject({
        model: await resolveModel(this.model),
        schema: z.object({
          domain: z.enum([
            'transactional',
            'dimensional',
            'reference',
            'bridge',
            'aggregate',
          ]),
          description: z
            .string()
            .describe('Business description of this entity'),
          businessName: z
            .string()
            .describe('Human-friendly name for this entity'),
        }),
        prompt: `Classify this database table:

TABLE: ${table.tableName}
COLUMNS: ${table.columns.map((c) => `${c.columnName} (${c.columnType}${c.isPrimaryKey ? ', PK' : ''}${c.isForeignKey ? ', FK' : ''})`).join(', ')}
FK COUNT: ${table.foreignKeyColumns.length}
NUMERIC COLUMNS: ${table.columns.filter((c) => c.isNumeric).length}

Classify the domain type and provide a business-friendly description.`,
      });

      return createEntityClass({
        name: object.businessName || table.tableName,
        sourceTable: table.tableName,
        description: object.description,
        domain: object.domain,
        requiredProperties: table.columns
          .filter((c) => c.isPrimaryKey)
          .map((c) => c.columnName),
        optionalProperties: table.columns
          .filter((c) => !c.isPrimaryKey)
          .map((c) => c.columnName),
        primaryKey: table.primaryKeyColumns,
        confidence: 0.85,
        inferenceMethod: 'llm',
      });
    } catch {
      // Fallback to schema-based classification
      return createEntityClass({
        name: table.tableName,
        sourceTable: table.tableName,
        description: `Entity representing ${table.tableName}`,
        domain: table.domain,
        requiredProperties: table.columns
          .filter((c) => c.isPrimaryKey)
          .map((c) => c.columnName),
        optionalProperties: table.columns
          .filter((c) => !c.isPrimaryKey)
          .map((c) => c.columnName),
        primaryKey: table.primaryKeyColumns,
        confidence: 0.6,
        inferenceMethod: 'schema',
      });
    }
  }

  /**
   * Suggest additional metrics for a table
   */
  async suggestMetrics(
    table: TableAnalysis,
    existingMetrics: Metric[],
  ): Promise<Metric[]> {
    const numericColumns = table.columns.filter(
      (c) => c.isNumeric && !c.isForeignKey,
    );
    if (numericColumns.length === 0) return [];

    try {
      const { object } = await generateObject({
        model: await resolveModel(this.model),
        schema: z.object({
          metrics: z.array(
            z.object({
              name: z.string(),
              column: z.string(),
              aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']),
              description: z.string(),
              format: z.enum(['number', 'currency', 'percentage']).optional(),
            }),
          ),
        }),
        prompt: `Suggest business metrics for this table:

TABLE: ${table.tableName}
NUMERIC COLUMNS: ${numericColumns.map((c) => c.columnName).join(', ')}
EXISTING METRICS: ${existingMetrics.map((m) => m.name).join(', ') || 'none'}

Suggest meaningful business metrics with appropriate aggregations.`,
      });

      return object.metrics.map((m) =>
        createMetric({
          name: m.name,
          expression: `${m.aggregation.toUpperCase()}(${table.tableName}.${m.column})`,
          description: m.description,
          requiredTables: [table.tableName],
          aggregation: m.aggregation,
          format: m.format,
          metricType: 'simple',
          confidence: 0.75,
          inferenceMethod: 'llm',
        }),
      );
    } catch {
      // Fallback: create basic metrics for numeric columns
      return numericColumns.slice(0, 3).map((col) =>
        createMetric({
          name: `total_${col.columnName}`,
          expression: `SUM(${table.tableName}.${col.columnName})`,
          description: `Sum of ${col.columnName}`,
          requiredTables: [table.tableName],
          aggregation: 'sum',
          metricType: 'simple',
          confidence: 0.5,
          inferenceMethod: 'schema',
        }),
      );
    }
  }

  /**
   * Infer domain classification for the entire schema
   */
  async inferDomain(tables: TableAnalysis[]): Promise<{
    domain: string;
    confidence: number;
    keywords: string[];
  }> {
    try {
      const { object } = await generateObject({
        model: await resolveModel(this.model),
        schema: z.object({
          domain: z
            .string()
            .describe(
              'Business domain (e.g., "e-commerce", "healthcare", "finance")',
            ),
          confidence: z.number().min(0).max(1),
          keywords: z
            .array(z.string())
            .describe('Keywords that indicate this domain'),
        }),
        prompt: `Identify the business domain from these tables:

TABLES: ${tables.map((t) => t.tableName).join(', ')}

Classify the overall business domain.`,
      });

      return object;
    } catch {
      return {
        domain: 'general',
        confidence: 0.3,
        keywords: [],
      };
    }
  }
}

export const semanticLLM = new SemanticLLMService();
