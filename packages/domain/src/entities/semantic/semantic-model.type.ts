import type { Metric } from './metric.type';
import type { Dimension } from './dimension.type';
import type { JoinPath } from './join-path.type';
import type { EntityClass } from './entity-class.type';
import type { PropertyDefinition } from './property-definition.type';
import type { SemanticRelationship } from './semantic-relationship.type';
import type { SemanticConstraint } from './semantic-constraint.type';
import type { SemanticView } from './semantic-view.type';

/**
 * Inference log entry for tracking how elements were inferred
 */
export interface InferenceLogEntry {
  /** Timestamp */
  timestamp: Date;
  /** Element type */
  elementType: 'entity' | 'property' | 'relationship' | 'metric' | 'dimension';
  /** Element ID */
  elementId: string;
  /** Inference method used */
  method: 'schema' | 'statistical' | 'llm' | 'user_defined';
  /** Confidence score */
  confidence: number;
  /** Reasoning/explanation */
  reasoning?: string;
}

/**
 * Domain classification for the semantic model
 */
export interface DomainClassification {
  /** Primary domain */
  domain: string;
  /** Confidence in classification */
  confidence: number;
  /** Keywords that led to classification */
  keywords: string[];
  /** Alternative domains considered */
  alternatives: Array<{ domain: string; confidence: number }>;
}

/**
 * Learning event for adaptive ontology improvement
 * Tracks user interactions to improve the semantic model over time
 */
export interface LearningEvent {
  /** Unique identifier */
  id: string;
  /** When the event occurred */
  timestamp: Date;
  /** Type of learning event */
  type:
    | 'query_success'
    | 'query_failure'
    | 'user_correction'
    | 'synonym_learned';
  /** Context about the event */
  context: {
    userQuery?: string;
    generatedSQL?: string;
    errorMessage?: string;
    correction?: string;
    entities?: string[];
  };
  /** Impact on the semantic model */
  impact: {
    synonymsAdded?: string[];
    confidenceAdjusted?: Array<{ elementId: string; delta: number }>;
    metricsInferred?: string[];
  };
}

/**
 * A semantic model defines the business layer over raw data
 * It provides metrics, dimensions, and join paths that allow
 * deterministic query generation without relying on LLMs
 */
export interface SemanticModel {
  /** Unique identifier */
  id: string;

  /** Project/workspace this model belongs to */
  projectId: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Version for tracking changes */
  version: number;

  /** Metrics (calculated measures) */
  metrics: Map<string, Metric>;

  /** Dimensions (grouping attributes) */
  dimensions: Map<string, Dimension>;

  /** Join paths between tables (legacy, kept for compatibility) */
  joins: JoinPath[];

  /** Table aliases for user-friendly names */
  tableAliases: Map<string, string>;

  /** Column aliases for user-friendly names */
  columnAliases: Map<string, string>;

  /** Synonyms for natural language matching */
  synonyms: Map<string, string[]>;

  /** Entity classes (OWL-style ontology) */
  entityClasses: Map<string, EntityClass>;

  /** Property definitions (OWL-style) */
  properties: Map<string, PropertyDefinition>;

  /** Semantic relationships between entities */
  relationships: SemanticRelationship[];

  /** Validation constraints (SHACL-style) */
  constraints: SemanticConstraint[];

  /** Semantic views for governance */
  views: Map<string, SemanticView>;

  /** Domain classification */
  domainClassification?: DomainClassification;

  /** Inference log for explainability */
  inferenceLog: InferenceLogEntry[];

  /** Learning events for adaptive ontology improvement */
  learningEvents: LearningEvent[];

  /** Overall confidence score (0-1) */
  confidenceScore: number;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Create an empty semantic model
 */
export function createSemanticModel(params: {
  id?: string;
  projectId: string;
  name: string;
  description?: string;
}): SemanticModel {
  return {
    id: params.id ?? crypto.randomUUID(),
    projectId: params.projectId,
    name: params.name,
    description: params.description ?? '',
    version: 1,
    metrics: new Map(),
    dimensions: new Map(),
    joins: [],
    tableAliases: new Map(),
    columnAliases: new Map(),
    synonyms: new Map(),
    entityClasses: new Map(),
    properties: new Map(),
    relationships: [],
    constraints: [],
    views: new Map(),
    inferenceLog: [],
    learningEvents: [],
    confidenceScore: 1.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Serializable version of SemanticModel for persistence
 */
export interface SerializedSemanticModel {
  id: string;
  projectId: string;
  name: string;
  description: string;
  version: number;
  metrics: Record<string, Metric>;
  dimensions: Record<string, Dimension>;
  joins: JoinPath[];
  tableAliases: Record<string, string>;
  columnAliases: Record<string, string>;
  synonyms: Record<string, string[]>;
  entityClasses: Record<string, EntityClass>;
  properties: Record<string, PropertyDefinition>;
  relationships: SemanticRelationship[];
  constraints: SemanticConstraint[];
  views: Record<string, SemanticView>;
  domainClassification?: DomainClassification;
  inferenceLog: Array<
    Omit<InferenceLogEntry, 'timestamp'> & { timestamp: string }
  >;
  learningEvents: Array<
    Omit<LearningEvent, 'timestamp'> & { timestamp: string }
  >;
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert semantic model to serializable format
 */
export function serializeSemanticModel(
  model: SemanticModel,
): SerializedSemanticModel {
  return {
    id: model.id,
    projectId: model.projectId,
    name: model.name,
    description: model.description,
    version: model.version,
    metrics: Object.fromEntries(model.metrics),
    dimensions: Object.fromEntries(model.dimensions),
    joins: model.joins,
    tableAliases: Object.fromEntries(model.tableAliases),
    columnAliases: Object.fromEntries(model.columnAliases),
    synonyms: Object.fromEntries(model.synonyms),
    entityClasses: Object.fromEntries(model.entityClasses),
    properties: Object.fromEntries(model.properties),
    relationships: model.relationships,
    constraints: model.constraints,
    views: Object.fromEntries(model.views),
    domainClassification: model.domainClassification,
    inferenceLog: model.inferenceLog.map((e) => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    })),
    learningEvents: model.learningEvents.map((e) => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    })),
    confidenceScore: model.confidenceScore,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

/**
 * Parse serialized semantic model
 */
export function deserializeSemanticModel(
  data: SerializedSemanticModel,
): SemanticModel {
  return {
    id: data.id,
    projectId: data.projectId,
    name: data.name,
    description: data.description,
    version: data.version,
    metrics: new Map(Object.entries(data.metrics)),
    dimensions: new Map(Object.entries(data.dimensions)),
    joins: data.joins,
    tableAliases: new Map(Object.entries(data.tableAliases)),
    columnAliases: new Map(Object.entries(data.columnAliases)),
    synonyms: new Map(Object.entries(data.synonyms)),
    entityClasses: new Map(Object.entries(data.entityClasses ?? {})),
    properties: new Map(Object.entries(data.properties ?? {})),
    relationships: data.relationships ?? [],
    constraints: data.constraints ?? [],
    views: new Map(Object.entries(data.views ?? {})),
    domainClassification: data.domainClassification,
    inferenceLog: (data.inferenceLog ?? []).map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    })),
    learningEvents: (data.learningEvents ?? []).map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    })),
    confidenceScore: data.confidenceScore ?? 1.0,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}
