import { describe, it, expect, beforeEach } from 'vitest';
import { semanticModelService } from '../../src/services/semantic';
import { detectIntent } from '../../src/agents/actors/detect-intent.actor';
import type { SimpleSchema } from '@qwery/domain/entities';

const testSchema: SimpleSchema = {
  databaseName: 'ecommerce',
  schemaName: 'public',
  tables: [
    {
      tableName: 'customers',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'email', columnType: 'VARCHAR' },
      ],
    },
    {
      tableName: 'orders',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'customer_id', columnType: 'INTEGER' },
        { columnName: 'total_amount', columnType: 'DECIMAL(10,2)' },
        { columnName: 'order_date', columnType: 'DATE' },
      ],
    },
    {
      tableName: 'products',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'price', columnType: 'DECIMAL(10,2)' },
      ],
    },
  ],
};

describe('Semantic-Aware Intent Detection', () => {
  beforeEach(() => {
    semanticModelService.clearCache();
  });

  describe('with cached semantic model', () => {
    beforeEach(() => {
      semanticModelService.getOrBuild('test-ds', testSchema);
    });

    it('detects read-data intent when query mentions entity name', async () => {
      const result = await detectIntent(
        'What are my customers doing?',
        undefined,
        'test-ds',
      );

      expect(result.intent).toBe('read-data');
      expect(result.needsSQL).toBe(true);
    });

    it('detects read-data intent when query mentions table from schema', async () => {
      const result = await detectIntent(
        'Show me the orders table',
        undefined,
        'test-ds',
      );

      expect(result.intent).toBe('read-data');
      expect(result.needsSQL).toBe(true);
    });

    it('detects read-data intent for vocabulary synonyms', async () => {
      const result = await detectIntent(
        'How much revenue did we make?',
        undefined,
        'test-ds',
      );

      expect(result.intent).toBe('read-data');
      expect(result.needsSQL).toBe(true);
    });
  });

  describe('without datasource context', () => {
    it('falls back to keyword detection for data queries', async () => {
      const result = await detectIntent(
        'Show me all the data',
        undefined,
        undefined,
      );

      expect(result.intent).toBe('read-data');
    });

    it('detects greeting without semantic context', async () => {
      const result = await detectIntent('Hello there!', undefined, undefined);

      expect(result.intent).toBe('greeting');
    });
  });

  describe('without cached model', () => {
    it('falls back to keyword detection when model not cached', async () => {
      const result = await detectIntent(
        'Show me the customers',
        undefined,
        'uncached-ds',
      );

      expect(result.intent).toBe('read-data');
    });
  });
});
