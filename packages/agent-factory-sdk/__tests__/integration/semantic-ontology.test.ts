import { describe, it, expect, beforeAll } from 'vitest';
import {
  semanticModelService,
  schemaAnalyzer,
  constraintValidator,
  queryPlanner,
} from '../../src/services/semantic';
import type { SimpleSchema, SemanticModel } from '@qwery/domain/entities';
import { createSemanticConstraint } from '@qwery/domain/entities';

// Mock e-commerce schema
const ecommerceSchema: SimpleSchema = {
  databaseName: 'ecommerce',
  schemaName: 'public',
  tables: [
    {
      tableName: 'orders',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'customer_id', columnType: 'INTEGER' },
        { columnName: 'order_date', columnType: 'DATE' },
        { columnName: 'total_amount', columnType: 'DECIMAL(10,2)' },
        { columnName: 'status', columnType: 'VARCHAR' },
      ],
    },
    {
      tableName: 'customers',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'email', columnType: 'VARCHAR' },
        { columnName: 'segment', columnType: 'VARCHAR' },
        { columnName: 'country', columnType: 'VARCHAR' },
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
        { columnName: 'price', columnType: 'DECIMAL(10,2)' },
      ],
    },
  ],
};

describe('Enhanced Semantic Layer - Ontology Tests', () => {
  let model: SemanticModel;

  beforeAll(() => {
    model = semanticModelService.buildFromSchema(
      'test-project',
      ecommerceSchema,
    );
  });

  describe('1. Schema Analyzer', () => {
    it('should analyze table structure correctly', () => {
      const analyses = schemaAnalyzer.analyzeTableStructure(ecommerceSchema);

      expect(analyses).toHaveLength(4);

      const ordersAnalysis = analyses.find((a) => a.tableName === 'orders');
      expect(ordersAnalysis).toBeDefined();
      expect(ordersAnalysis!.foreignKeyColumns).toContain('customer_id');

      // order_items has 2 FKs (order_id, product_id) + numeric columns, so it's a fact
      const orderItemsAnalysis = analyses.find(
        (a) => a.tableName === 'order_items',
      );
      expect(orderItemsAnalysis).toBeDefined();
      expect(orderItemsAnalysis!.isLikelyFact).toBe(true);
    });

    it('should classify tables correctly', () => {
      const classifications = schemaAnalyzer.classifyTables(ecommerceSchema);

      // order_items is a fact table (multiple FKs + measures)
      const orderItemsClass = classifications.find(
        (c) => c.tableName === 'order_items',
      );
      expect(orderItemsClass?.classification).toBe('fact');

      const customersClass = classifications.find(
        (c) => c.tableName === 'customers',
      );
      expect(customersClass?.classification).toBe('dimension');
    });

    it('should detect relationships', () => {
      const relationships = schemaAnalyzer.detectRelationships(ecommerceSchema);

      expect(relationships.length).toBeGreaterThan(0);

      const orderCustomerRel = relationships.find(
        (r) => r.fromTable === 'orders' && r.toTable === 'customers',
      );
      expect(orderCustomerRel).toBeDefined();
      expect(orderCustomerRel!.cardinality).toBe('many_to_one');
    });
  });

  describe('2. Entity Classes', () => {
    it('should create entity classes for all tables', () => {
      expect(model.entityClasses.size).toBe(4);
    });

    it('should classify entity domains correctly', () => {
      // order_items has 2 FKs + numeric columns = transactional/fact
      const orderItemsEntity = model.entityClasses.get('order_items');
      expect(orderItemsEntity).toBeDefined();
      expect(orderItemsEntity!.domain).toBe('transactional');

      const customersEntity = model.entityClasses.get('customers');
      expect(customersEntity).toBeDefined();
      expect(customersEntity!.domain).toBe('dimensional');
    });

    it('should identify primary keys', () => {
      const ordersEntity = model.entityClasses.get('orders');
      expect(ordersEntity!.primaryKey).toContain('id');
    });

    it('should identify required properties', () => {
      const ordersEntity = model.entityClasses.get('orders');
      expect(ordersEntity!.requiredProperties).toContain('id');
    });
  });

  describe('3. Property Definitions', () => {
    it('should create property definitions for all columns', () => {
      // orders has 5 columns, customers has 5, order_items has 5, products has 4
      expect(model.properties.size).toBe(19);
    });

    it('should correctly identify data types', () => {
      const totalAmountProp = model.properties.get('orders.total_amount');
      expect(totalAmountProp).toBeDefined();
      expect(totalAmountProp!.range).toBe('number');
    });

    it('should mark primary key properties as unique', () => {
      const idProp = model.properties.get('orders.id');
      expect(idProp).toBeDefined();
      expect(idProp!.unique).toBe(true);
    });
  });

  describe('4. Semantic Relationships', () => {
    it('should create semantic relationships', () => {
      expect(model.relationships.length).toBeGreaterThan(0);
    });

    it('should identify relationship types', () => {
      const orderCustomerRel = model.relationships.find(
        (r) => r.fromEntity === 'orders' && r.toEntity === 'customers',
      );
      expect(orderCustomerRel).toBeDefined();
      expect(orderCustomerRel!.type).toBe('references');
    });

    it('should generate join conditions', () => {
      const orderCustomerRel = model.relationships.find(
        (r) => r.fromEntity === 'orders' && r.toEntity === 'customers',
      );
      expect(orderCustomerRel!.joinCondition).toContain('customer_id');
    });
  });

  describe('5. Metrics and Dimensions', () => {
    it('should infer metrics from numeric columns', () => {
      expect(model.metrics.size).toBeGreaterThan(0);

      const totalAmountMetric = model.metrics.get('total_amount');
      expect(totalAmountMetric).toBeDefined();
      expect(totalAmountMetric!.aggregation).toBe('sum');
    });

    it('should infer dimensions from categorical columns', () => {
      expect(model.dimensions.size).toBeGreaterThan(0);

      const statusDim = model.dimensions.get('status');
      expect(statusDim).toBeDefined();
      expect(statusDim!.cardinality).toBe('low');
    });

    it('should include metric metadata', () => {
      const metric = model.metrics.get('total_amount');
      expect(metric!.metricType).toBe('simple');
      expect(metric!.confidence).toBeDefined();
    });
  });

  describe('6. Inference Log', () => {
    it('should track inference log entries', () => {
      expect(model.inferenceLog.length).toBeGreaterThan(0);
    });

    it('should record element types', () => {
      const entityLogs = model.inferenceLog.filter(
        (l) => l.elementType === 'entity',
      );
      expect(entityLogs.length).toBe(4); // 4 tables

      const relationshipLogs = model.inferenceLog.filter(
        (l) => l.elementType === 'relationship',
      );
      expect(relationshipLogs.length).toBeGreaterThan(0);
    });

    it('should record confidence scores', () => {
      for (const log of model.inferenceLog) {
        expect(log.confidence).toBeGreaterThanOrEqual(0);
        expect(log.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('7. Overall Confidence', () => {
    it('should calculate overall confidence score', () => {
      expect(model.confidenceScore).toBeGreaterThan(0);
      expect(model.confidenceScore).toBeLessThanOrEqual(1);
    });
  });

  describe('8. Constraint Validator', () => {
    it('should validate property constraints', () => {
      const constraint = createSemanticConstraint({
        name: 'email_format',
        targetClass: 'customers',
        propertyConstraints: [
          {
            property: 'email',
            pattern: '^[^@]+@[^@]+\\.[^@]+$',
            message: 'Email must be valid format',
          },
        ],
        severity: 'error',
      });

      const validData = { email: 'test@example.com' };
      const invalidData = { email: 'invalid-email' };

      const entity = model.entityClasses.get('customers')!;

      const validResult = constraintValidator.validate(validData, entity, [
        constraint,
      ]);
      expect(validResult.valid).toBe(true);

      const invalidResult = constraintValidator.validate(invalidData, entity, [
        constraint,
      ]);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBe(1);
    });

    it('should validate minCount constraints', () => {
      const constraint = createSemanticConstraint({
        name: 'required_name',
        targetClass: 'customers',
        propertyConstraints: [
          {
            property: 'name',
            minCount: 1,
          },
        ],
        severity: 'error',
      });

      const entity = model.entityClasses.get('customers')!;

      const withName = { name: 'John' };
      const withoutName = {};

      const validResult = constraintValidator.validate(withName, entity, [
        constraint,
      ]);
      expect(validResult.valid).toBe(true);

      const invalidResult = constraintValidator.validate(withoutName, entity, [
        constraint,
      ]);
      expect(invalidResult.valid).toBe(false);
    });

    it('should validate class constraints', () => {
      const constraint = createSemanticConstraint({
        name: 'at_least_one_contact',
        targetClass: 'customers',
        classConstraints: [
          {
            type: 'at_least_one',
            properties: ['email', 'phone'],
          },
        ],
        severity: 'warning',
      });

      const entity = model.entityClasses.get('customers')!;

      const withEmail = { email: 'test@example.com' };
      const withNeither = {};

      const validResult = constraintValidator.validate(withEmail, entity, [
        constraint,
      ]);
      expect(validResult.valid).toBe(true);

      const invalidResult = constraintValidator.validate(withNeither, entity, [
        constraint,
      ]);
      expect(invalidResult.warnings.length).toBe(1);
    });
  });

  describe('9. Query Planner with Relationships', () => {
    it('should resolve joins using semantic relationships', () => {
      const plan = queryPlanner.plan(
        {
          userQuery: 'Show total amount by customer segment',
          intent: {
            metrics: ['total_amount'],
            dimensions: ['segment'],
          },
        },
        model,
      );

      // Should have joins since metrics and dimensions are from different tables
      expect(plan.tables.length).toBeGreaterThan(0);
    });

    it('should generate SQL from logical plan', () => {
      const plan = queryPlanner.plan(
        {
          userQuery: 'Total orders by status',
          intent: {
            metrics: ['total_amount'],
            dimensions: ['status'],
          },
        },
        model,
      );

      const sql = queryPlanner.generateSQL(plan, model);
      expect(sql).toContain('SELECT');
      expect(sql).toContain('SUM');
    });
  });

  describe('10. Synonyms', () => {
    it('should include common business synonyms', () => {
      expect(model.synonyms.has('revenue')).toBe(true);
      expect(model.synonyms.get('revenue')).toContain('sales');
    });
  });
});
