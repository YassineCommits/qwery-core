import { describe, it, expect, beforeEach } from 'vitest';
import { semanticModelService } from '../../src/services/semantic';
import type { SimpleSchema } from '@qwery/domain/entities';

const testSchema: SimpleSchema = {
  databaseName: 'test_db',
  schemaName: 'public',
  tables: [
    {
      tableName: 'users',
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
        { columnName: 'user_id', columnType: 'INTEGER' },
        { columnName: 'total', columnType: 'DECIMAL(10,2)' },
      ],
    },
  ],
};

describe('SemanticModelService Caching', () => {
  beforeEach(() => {
    semanticModelService.clearCache();
  });

  describe('getOrBuild', () => {
    it('builds and caches model on first call', () => {
      const model = semanticModelService.getOrBuild('ds-1', testSchema);

      expect(model).toBeDefined();
      expect(model.entityClasses.size).toBeGreaterThan(0);
      expect(semanticModelService.isCached('ds-1')).toBe(true);
    });

    it('returns cached model on subsequent calls', () => {
      const model1 = semanticModelService.getOrBuild('ds-2', testSchema);
      const model2 = semanticModelService.getOrBuild('ds-2', testSchema);

      expect(model1).toBe(model2);
    });

    it('caches models per datasource', () => {
      const model1 = semanticModelService.getOrBuild('ds-a', testSchema);
      const model2 = semanticModelService.getOrBuild('ds-b', testSchema);

      expect(model1).not.toBe(model2);
      expect(semanticModelService.isCached('ds-a')).toBe(true);
      expect(semanticModelService.isCached('ds-b')).toBe(true);
    });
  });

  describe('getCached', () => {
    it('returns undefined for uncached datasource', () => {
      expect(semanticModelService.getCached('nonexistent')).toBeUndefined();
    });

    it('returns cached model after getOrBuild', () => {
      semanticModelService.getOrBuild('ds-3', testSchema);
      const cached = semanticModelService.getCached('ds-3');

      expect(cached).toBeDefined();
      expect(cached?.entityClasses.size).toBeGreaterThan(0);
    });
  });

  describe('isCached', () => {
    it('returns false for uncached datasource', () => {
      expect(semanticModelService.isCached('uncached')).toBe(false);
    });

    it('returns true after caching', () => {
      semanticModelService.getOrBuild('ds-4', testSchema);
      expect(semanticModelService.isCached('ds-4')).toBe(true);
    });
  });

  describe('invalidate', () => {
    it('removes specific datasource from cache', () => {
      semanticModelService.getOrBuild('ds-5', testSchema);
      expect(semanticModelService.isCached('ds-5')).toBe(true);

      semanticModelService.invalidate('ds-5');
      expect(semanticModelService.isCached('ds-5')).toBe(false);
    });

    it('does not affect other cached datasources', () => {
      semanticModelService.getOrBuild('ds-6', testSchema);
      semanticModelService.getOrBuild('ds-7', testSchema);

      semanticModelService.invalidate('ds-6');

      expect(semanticModelService.isCached('ds-6')).toBe(false);
      expect(semanticModelService.isCached('ds-7')).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('removes all cached models', () => {
      semanticModelService.getOrBuild('ds-8', testSchema);
      semanticModelService.getOrBuild('ds-9', testSchema);

      semanticModelService.clearCache();

      expect(semanticModelService.isCached('ds-8')).toBe(false);
      expect(semanticModelService.isCached('ds-9')).toBe(false);
    });
  });

  describe('getCachedDatasourceIds', () => {
    it('returns empty array when cache is empty', () => {
      expect(semanticModelService.getCachedDatasourceIds()).toEqual([]);
    });

    it('returns all cached datasource IDs', () => {
      semanticModelService.getOrBuild('ds-10', testSchema);
      semanticModelService.getOrBuild('ds-11', testSchema);

      const ids = semanticModelService.getCachedDatasourceIds();
      expect(ids).toContain('ds-10');
      expect(ids).toContain('ds-11');
      expect(ids.length).toBe(2);
    });
  });
});
