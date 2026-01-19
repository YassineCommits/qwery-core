import { describe, it, expect } from 'vitest';
import { semanticModelService } from '../../src/services/semantic';
import type { SimpleSchema } from '@qwery/domain/entities';

describe('Join Inference Tests', () => {
  describe('Deterministic FK-based Join Detection', () => {
    it('should infer correct join when target table uses same FK column name (customer_id -> customer_id)', () => {
      // This is the real PostgreSQL schema from the test database
      const schema: SimpleSchema = {
        databaseName: 'pg',
        schemaName: 'public',
        tables: [
          {
            tableName: 'orders',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'customer_id', columnType: 'INTEGER' },
              { columnName: 'order_date', columnType: 'DATE' },
              { columnName: 'total', columnType: 'DECIMAL(10,2)' },
            ],
          },
          {
            tableName: 'customers',
            columns: [
              { columnName: 'customer_id', columnType: 'INTEGER' }, // PK is customer_id, not id
              { columnName: 'name', columnType: 'VARCHAR' },
              { columnName: 'email', columnType: 'VARCHAR' },
            ],
          },
        ],
      };

      const model = semanticModelService.buildFromSchema('test', schema);

      console.log('\n=== Join Inference: Same FK column name ===');
      console.log('Schema: orders.customer_id -> customers.customer_id');
      console.log('Inferred joins:', model.joins);

      // BEFORE FIX: Would incorrectly infer customer_id -> id
      // AFTER FIX: Should correctly infer customer_id -> customer_id
      const join = model.joins.find(
        (j) => j.fromTable === 'orders' && j.toTable === 'customers',
      );

      expect(join).toBeDefined();
      expect(join!.fromColumn).toBe('customer_id');
      expect(join!.toColumn).toBe('customer_id'); // NOT 'id'!
    });

    it('should fallback to id when target table has id as PK', () => {
      const schema: SimpleSchema = {
        databaseName: 'pg',
        schemaName: 'public',
        tables: [
          {
            tableName: 'order_items',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'order_id', columnType: 'INTEGER' },
              { columnName: 'product_id', columnType: 'INTEGER' },
            ],
          },
          {
            tableName: 'products',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' }, // Standard id PK
              { columnName: 'name', columnType: 'VARCHAR' },
            ],
          },
        ],
      };

      const model = semanticModelService.buildFromSchema('test', schema);

      console.log('\n=== Join Inference: Standard id PK ===');
      console.log('Schema: order_items.product_id -> products.id');
      console.log('Inferred joins:', model.joins);

      const join = model.joins.find(
        (j) => j.fromTable === 'order_items' && j.toTable === 'products',
      );

      expect(join).toBeDefined();
      expect(join!.fromColumn).toBe('product_id');
      expect(join!.toColumn).toBe('id'); // Correct fallback
    });

    it('should handle singular to plural table name mapping', () => {
      const schema: SimpleSchema = {
        databaseName: 'test',
        schemaName: 'public',
        tables: [
          {
            tableName: 'invoices',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'customer_id', columnType: 'INTEGER' },
            ],
          },
          {
            tableName: 'customers', // Plural
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'name', columnType: 'VARCHAR' },
            ],
          },
        ],
      };

      const model = semanticModelService.buildFromSchema('test', schema);

      console.log('\n=== Join Inference: Singular to Plural ===');
      console.log('Schema: invoices.customer_id -> customers.id');
      console.log('Inferred joins:', model.joins);

      const join = model.joins.find(
        (j) => j.fromTable === 'invoices' && j.toTable === 'customers',
      );

      expect(join).toBeDefined();
      expect(join!.toColumn).toBe('id');
    });

    it('should not create invalid joins for non-existent tables', () => {
      const schema: SimpleSchema = {
        databaseName: 'test',
        schemaName: 'public',
        tables: [
          {
            tableName: 'orders',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'nonexistent_id', columnType: 'INTEGER' }, // No matching table
            ],
          },
        ],
      };

      const model = semanticModelService.buildFromSchema('test', schema);

      console.log('\n=== Join Inference: Non-existent Table ===');
      console.log('Schema: orders.nonexistent_id -> ???');
      console.log('Inferred joins:', model.joins);

      // Should not create a join for non-existent table
      const join = model.joins.find((j) => j.fromColumn === 'nonexistent_id');
      expect(join).toBeUndefined();
    });
  });

  describe('Real-world Schema (PostgreSQL test database)', () => {
    it('should correctly infer all joins for the e-commerce schema', () => {
      const schema: SimpleSchema = {
        databaseName: 'pg',
        schemaName: 'public',
        tables: [
          {
            tableName: 'orders',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'customer_id', columnType: 'INTEGER' },
              { columnName: 'order_date', columnType: 'DATE' },
              { columnName: 'total', columnType: 'DECIMAL(10,2)' },
            ],
          },
          {
            tableName: 'customers',
            columns: [
              { columnName: 'customer_id', columnType: 'INTEGER' },
              { columnName: 'name', columnType: 'VARCHAR' },
              { columnName: 'email', columnType: 'VARCHAR' },
              { columnName: 'segment', columnType: 'VARCHAR' },
            ],
          },
          {
            tableName: 'order_items',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'order_id', columnType: 'INTEGER' },
              { columnName: 'product_id', columnType: 'INTEGER' },
              { columnName: 'quantity', columnType: 'INTEGER' },
              { columnName: 'unit_price', columnType: 'DECIMAL(10,2)' },
            ],
          },
          {
            tableName: 'products',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'name', columnType: 'VARCHAR' },
              { columnName: 'category', columnType: 'VARCHAR' },
              { columnName: 'unit_price', columnType: 'DECIMAL(10,2)' },
            ],
          },
          {
            tableName: 'payments',
            columns: [
              { columnName: 'id', columnType: 'INTEGER' },
              { columnName: 'order_id', columnType: 'INTEGER' },
              { columnName: 'amount', columnType: 'DECIMAL(10,2)' },
              { columnName: 'method', columnType: 'VARCHAR' },
            ],
          },
        ],
      };

      const model = semanticModelService.buildFromSchema('test', schema);

      console.log('\n=== Real-world Schema Join Inference ===');
      console.log('Inferred joins:');
      model.joins.forEach((j) => {
        console.log(
          `  ${j.fromTable}.${j.fromColumn} -> ${j.toTable}.${j.toColumn}`,
        );
      });

      // Verify specific joins
      expect(model.joins).toContainEqual(
        expect.objectContaining({
          fromTable: 'orders',
          toTable: 'customers',
          fromColumn: 'customer_id',
          toColumn: 'customer_id',
        }),
      );

      expect(model.joins).toContainEqual(
        expect.objectContaining({
          fromTable: 'order_items',
          toTable: 'orders',
          fromColumn: 'order_id',
          toColumn: 'id',
        }),
      );

      expect(model.joins).toContainEqual(
        expect.objectContaining({
          fromTable: 'order_items',
          toTable: 'products',
          fromColumn: 'product_id',
          toColumn: 'id',
        }),
      );

      expect(model.joins).toContainEqual(
        expect.objectContaining({
          fromTable: 'payments',
          toTable: 'orders',
          fromColumn: 'order_id',
          toColumn: 'id',
        }),
      );
    });
  });
});
