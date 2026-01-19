/**
 * Types of content that can be embedded for RAG
 */
export type EmbeddingDocumentType =
  | 'table'
  | 'column'
  | 'relationship'
  | 'metric'
  | 'dimension'
  | 'vocabulary';

/**
 * Metadata for embedding documents
 */
export interface EmbeddingMetadata {
  /** Columns in the table (for table documents) */
  columns?: string[];

  /** Data type (for column documents) */
  dataType?: string;

  /** Cardinality hint */
  cardinality?: 'low' | 'medium' | 'high';

  /** Whether this is a foreign key */
  isForeignKey?: boolean;

  /** Related tables */
  relatedTables?: string[];

  /** Sample values (for columns) */
  sampleValues?: string[];

  /** Table this column belongs to */
  tableName?: string;

  /** Schema name */
  schemaName?: string;
}

/**
 * A document prepared for embedding in the vector store
 */
export interface SchemaEmbeddingDocument {
  /** Document type */
  type: EmbeddingDocumentType;

  /** Datasource identifier */
  datasourceId: string;

  /** Full path (e.g., "sales_db.public.orders") */
  path: string;

  /** Human-readable content for embedding */
  content: string;

  /** Structured metadata */
  metadata: EmbeddingMetadata;

  /** Embedding vector (populated after embedding) */
  embedding?: number[];

  /** Timestamp for cache invalidation */
  updatedAt: Date;
}

/**
 * Create a table embedding document
 */
export function createTableDocument(params: {
  datasourceId: string;
  path: string;
  tableName: string;
  columns: string[];
  description?: string;
}): SchemaEmbeddingDocument {
  const content = params.description
    ? `Table ${params.tableName}: ${params.description}. Columns: ${params.columns.join(', ')}`
    : `Table ${params.tableName} with columns: ${params.columns.join(', ')}`;

  return {
    type: 'table',
    datasourceId: params.datasourceId,
    path: params.path,
    content,
    metadata: {
      columns: params.columns,
    },
    updatedAt: new Date(),
  };
}

/**
 * Create a column embedding document
 */
export function createColumnDocument(params: {
  datasourceId: string;
  path: string;
  columnName: string;
  tableName: string;
  dataType: string;
  description?: string;
  isForeignKey?: boolean;
  sampleValues?: string[];
}): SchemaEmbeddingDocument {
  let content = `Column ${params.columnName} in table ${params.tableName}, type ${params.dataType}`;

  if (params.description) {
    content += `. ${params.description}`;
  }

  if (params.isForeignKey) {
    content += '. This is a foreign key.';
  }

  if (params.sampleValues && params.sampleValues.length > 0) {
    content += `. Sample values: ${params.sampleValues.slice(0, 3).join(', ')}`;
  }

  return {
    type: 'column',
    datasourceId: params.datasourceId,
    path: params.path,
    content,
    metadata: {
      dataType: params.dataType,
      tableName: params.tableName,
      isForeignKey: params.isForeignKey,
      sampleValues: params.sampleValues,
    },
    updatedAt: new Date(),
  };
}

/**
 * Create a relationship embedding document
 */
export function createRelationshipDocument(params: {
  datasourceId: string;
  fromTable: string;
  toTable: string;
  joinCondition: string;
  description?: string;
}): SchemaEmbeddingDocument {
  const content = params.description
    ? `Relationship: ${params.description}. ${params.fromTable} joins to ${params.toTable} on ${params.joinCondition}`
    : `${params.fromTable} joins to ${params.toTable} on ${params.joinCondition}`;

  return {
    type: 'relationship',
    datasourceId: params.datasourceId,
    path: `${params.fromTable}_${params.toTable}`,
    content,
    metadata: {
      relatedTables: [params.fromTable, params.toTable],
    },
    updatedAt: new Date(),
  };
}

/**
 * Create a vocabulary embedding document
 */
export function createVocabularyDocument(params: {
  datasourceId: string;
  term: string;
  synonyms: string[];
  mappedColumns: string[];
}): SchemaEmbeddingDocument {
  const content = `Business term "${params.term}" (also known as: ${params.synonyms.join(', ')}) maps to columns: ${params.mappedColumns.join(', ')}`;

  return {
    type: 'vocabulary',
    datasourceId: params.datasourceId,
    path: `vocabulary_${params.term}`,
    content,
    metadata: {
      columns: params.mappedColumns,
    },
    updatedAt: new Date(),
  };
}
