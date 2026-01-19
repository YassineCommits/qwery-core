/**
 * Cube.dev Semantic Layer Compatibility Tests
 *
 * Tests our semantic layer implementation against Cube.dev's four pillars:
 * 1. Data Modeling - Cubes, Measures, Dimensions, Joins
 * 2. Access Control - Views, Row-level security
 * 3. Caching/Performance - Pre-aggregations
 * 4. APIs/Governance - Metadata introspection, AI support
 *
 * Reference: https://cube.dev/docs/product/introduction
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  semanticModelService,
  constraintValidator,
  queryPlanner,
} from '../../src/services/semantic';
import type { SimpleSchema, SemanticModel } from '@qwery/domain/entities';
import {
  createSemanticView,
  createSemanticConstraint,
  createMetric,
  createDimension,
  serializeSemanticModel,
} from '@qwery/domain/entities';

// Comprehensive e-commerce schema (Cube.dev style)
const cubeStyleSchema: SimpleSchema = {
  databaseName: 'analytics',
  schemaName: 'public',
  tables: [
    {
      tableName: 'orders',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'customer_id', columnType: 'INTEGER' },
        { columnName: 'status', columnType: 'VARCHAR' },
        { columnName: 'created_at', columnType: 'TIMESTAMP' },
        { columnName: 'completed_at', columnType: 'TIMESTAMP' },
        { columnName: 'total_amount', columnType: 'DECIMAL(10,2)' },
        { columnName: 'shipping_cost', columnType: 'DECIMAL(10,2)' },
        { columnName: 'discount_amount', columnType: 'DECIMAL(10,2)' },
      ],
    },
    {
      tableName: 'customers',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'email', columnType: 'VARCHAR' },
        { columnName: 'first_name', columnType: 'VARCHAR' },
        { columnName: 'last_name', columnType: 'VARCHAR' },
        { columnName: 'segment', columnType: 'VARCHAR' },
        { columnName: 'country', columnType: 'VARCHAR' },
        { columnName: 'created_at', columnType: 'TIMESTAMP' },
      ],
    },
    {
      tableName: 'line_items',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'order_id', columnType: 'INTEGER' },
        { columnName: 'product_id', columnType: 'INTEGER' },
        { columnName: 'quantity', columnType: 'INTEGER' },
        { columnName: 'price', columnType: 'DECIMAL(10,2)' },
        { columnName: 'created_at', columnType: 'TIMESTAMP' },
      ],
    },
    {
      tableName: 'products',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'category', columnType: 'VARCHAR' },
        { columnName: 'subcategory', columnType: 'VARCHAR' },
        { columnName: 'brand', columnType: 'VARCHAR' },
        { columnName: 'price', columnType: 'DECIMAL(10,2)' },
        { columnName: 'cost', columnType: 'DECIMAL(10,2)' },
      ],
    },
  ],
};

describe('Cube.dev Semantic Layer Compatibility', () => {
  let model: SemanticModel;

  beforeAll(() => {
    model = semanticModelService.buildFromSchema(
      'cube-test-project',
      cubeStyleSchema,
    );
  });

  describe('Pillar 1: Data Modeling', () => {
    describe('1.1 Cubes (Entity Classes)', () => {
      it('should represent business entities as EntityClasses (Cubes)', () => {
        // Cube.dev: "Use Cubes to represent business entities"
        expect(model.entityClasses.size).toBe(4);
        expect(model.entityClasses.has('orders')).toBe(true);
        expect(model.entityClasses.has('customers')).toBe(true);
        expect(model.entityClasses.has('line_items')).toBe(true);
        expect(model.entityClasses.has('products')).toBe(true);
      });

      it('should classify entities by domain (fact vs dimension)', () => {
        // Cube.dev: dimensional modeling - facts and dimensions
        const lineItems = model.entityClasses.get('line_items');
        expect(lineItems?.domain).toBe('transactional'); // fact table (2+ FKs + numeric)

        // Products has no FKs, classified as reference (could be dimension)
        const products = model.entityClasses.get('products');
        expect(['dimensional', 'reference']).toContain(products?.domain);
      });

      it('should track entity metadata for discoverability', () => {
        const orders = model.entityClasses.get('orders');
        expect(orders?.sourceTable).toBe('orders');
        expect(orders?.requiredProperties.length).toBeGreaterThan(0);
        expect(orders?.confidence).toBeGreaterThan(0);
      });
    });

    describe('1.2 Measures (Metrics)', () => {
      it('should define quantitative measures', () => {
        // Cube.dev: "Measures (quantitative)"
        expect(model.metrics.size).toBeGreaterThan(0);

        // Should have inferred metrics from numeric columns
        const totalAmount = model.metrics.get('total_amount');
        expect(totalAmount).toBeDefined();
        expect(totalAmount?.aggregation).toBe('sum');
      });

      it('should support different metric types', () => {
        // Cube.dev supports: count, sum, avg, min, max, countDistinct, etc.
        // Add custom metrics to test
        const revenueMetric = createMetric({
          name: 'revenue',
          expression: 'SUM(orders.total_amount)',
          aggregation: 'sum',
          metricType: 'simple',
          requiredTables: ['orders'],
          format: 'currency',
        });
        model.metrics.set(revenueMetric.id, revenueMetric);

        const avgOrderValue = createMetric({
          name: 'average_order_value',
          expression: 'AVG(orders.total_amount)',
          aggregation: 'avg',
          metricType: 'simple',
          requiredTables: ['orders'],
        });
        model.metrics.set(avgOrderValue.id, avgOrderValue);

        expect(model.metrics.get('revenue')?.aggregation).toBe('sum');
        expect(model.metrics.get('average_order_value')?.aggregation).toBe(
          'avg',
        );
      });

      it('should support derived/ratio metrics', () => {
        // Cube.dev: derived measures (computed from other measures)
        const profitMargin = createMetric({
          name: 'profit_margin',
          expression:
            '(SUM(line_items.price) - SUM(products.cost)) / SUM(line_items.price)',
          metricType: 'ratio',
          numerator: 'profit',
          denominator: 'revenue',
          format: 'percentage',
          requiredTables: ['line_items', 'products'],
        });
        model.metrics.set(profitMargin.id, profitMargin);

        expect(profitMargin.metricType).toBe('ratio');
        expect(profitMargin.numerator).toBe('profit');
      });

      it('should support time-based metrics', () => {
        // Cube.dev: time dimensions and granularity
        const monthlyRevenue = createMetric({
          name: 'monthly_revenue',
          expression: 'SUM(orders.total_amount)',
          metricType: 'simple',
          timeGrain: 'month',
          requiredTables: ['orders'],
        });
        model.metrics.set(monthlyRevenue.id, monthlyRevenue);

        expect(monthlyRevenue.timeGrain).toBe('month');
      });

      it('should support filtered metrics (segments)', () => {
        // Cube.dev: "reusable filters or segments"
        const completedRevenue = createMetric({
          name: 'completed_revenue',
          expression: 'SUM(orders.total_amount)',
          metricType: 'simple',
          filters: [{ column: 'status', operator: '=', value: 'completed' }],
          requiredTables: ['orders'],
        });
        model.metrics.set(completedRevenue.id, completedRevenue);

        expect(completedRevenue.filters?.length).toBe(1);
        expect(completedRevenue.filters?.[0]?.value).toBe('completed');
      });
    });

    describe('1.3 Dimensions', () => {
      it('should define qualitative dimensions', () => {
        // Cube.dev: "Dimensions (qualitative)"
        expect(model.dimensions.size).toBeGreaterThan(0);

        const status = model.dimensions.get('status');
        expect(status).toBeDefined();
        expect(status?.cardinality).toBe('low');
      });

      it('should support time dimensions', () => {
        // Cube.dev: "Define time dimensions"
        // Note: multiple tables have created_at, check any of them
        const timeDimensions = Array.from(model.dimensions.values()).filter(
          (d) => d.column.includes('created_at') || d.column.includes('_at'),
        );
        expect(timeDimensions.length).toBeGreaterThan(0);

        // Verify time dimension type inference
        const orderDate = createDimension({
          name: 'order_date',
          column: 'orders.created_at',
          table: 'orders',
          dataType: 'datetime',
          dimensionType: 'time',
          timeGranularity: 'day',
        });
        model.dimensions.set(orderDate.id, orderDate);
        expect(orderDate.dataType).toBe('datetime');
        expect(orderDate.dimensionType).toBe('time');
      });

      it('should support hierarchical dimensions', () => {
        // Cube.dev: drill-down capabilities
        const categoryDim = createDimension({
          name: 'product_category',
          column: 'products.category',
          table: 'products',
          dimensionType: 'hierarchical',
          hierarchy: {
            name: 'product_hierarchy',
            levels: ['category', 'subcategory', 'brand'],
          },
          drillTo: ['subcategory'],
        });
        model.dimensions.set(categoryDim.id, categoryDim);

        expect(categoryDim.hierarchy?.levels).toContain('category');
        expect(categoryDim.hierarchy?.levels).toContain('subcategory');
        expect(categoryDim.drillTo).toContain('subcategory');
      });

      it('should support geographic dimensions', () => {
        const countryDim = createDimension({
          name: 'customer_country',
          column: 'customers.country',
          table: 'customers',
          dimensionType: 'geographic',
          cardinality: 'medium',
        });
        model.dimensions.set(countryDim.id, countryDim);

        expect(countryDim.dimensionType).toBe('geographic');
      });
    });

    describe('1.4 Joins (Relationships)', () => {
      it('should model relationships between entities explicitly', () => {
        // Cube.dev: "Model relationships between entities explicitly"
        expect(model.relationships.length).toBeGreaterThan(0);
      });

      it('should define join conditions', () => {
        const orderCustomerRel = model.relationships.find(
          (r) => r.fromEntity === 'orders' && r.toEntity === 'customers',
        );
        expect(orderCustomerRel).toBeDefined();
        expect(orderCustomerRel?.joinCondition).toContain('customer_id');
      });

      it('should specify cardinality', () => {
        // Cube.dev: belongsTo (many-to-one), hasMany (one-to-many)
        const lineItemOrderRel = model.relationships.find(
          (r) => r.fromEntity === 'line_items' && r.toEntity === 'orders',
        );
        expect(lineItemOrderRel?.cardinality).toBe('many_to_one');
      });

      it('should support relationship types', () => {
        const rel = model.relationships[0];
        expect(rel?.type).toBeDefined();
        expect([
          'is_a',
          'part_of',
          'has_a',
          'references',
          'aggregates',
        ]).toContain(rel?.type);
      });
    });
  });

  describe('Pillar 2: Access Control & Security', () => {
    describe('2.1 Views (Governance)', () => {
      it('should support semantic views for exposure control', () => {
        // Cube.dev: Views for governance and exposure
        const salesView = createSemanticView({
          name: 'sales_analytics',
          baseEntity: 'orders',
          exposedMetrics: ['revenue', 'average_order_value', 'order_count'],
          exposedDimensions: ['status', 'created_at', 'customer_country'],
          includedEntities: ['customers'],
          publicAccess: true,
        });
        model.views.set(salesView.id, salesView);

        expect(salesView.exposedMetrics).toContain('revenue');
        expect(salesView.publicAccess).toBe(true);
      });

      it('should support role-based access control', () => {
        const adminView = createSemanticView({
          name: 'admin_financials',
          baseEntity: 'orders',
          exposedMetrics: ['revenue', 'profit_margin', 'discount_amount'],
          exposedDimensions: ['status', 'customer_segment'],
          publicAccess: false,
          allowedRoles: ['admin', 'finance'],
        });
        model.views.set(adminView.id, adminView);

        expect(adminView.publicAccess).toBe(false);
        expect(adminView.allowedRoles).toContain('admin');
      });

      it('should support row-level security', () => {
        const teamView = createSemanticView({
          name: 'team_orders',
          baseEntity: 'orders',
          exposedMetrics: ['revenue'],
          exposedDimensions: ['status'],
          publicAccess: false,
          rowLevelSecurity: 'customers.segment = CURRENT_USER_SEGMENT()',
        });
        model.views.set(teamView.id, teamView);

        expect(teamView.rowLevelSecurity).toBeDefined();
      });
    });

    describe('2.2 Constraints (Validation)', () => {
      it('should validate data quality constraints', () => {
        const constraint = createSemanticConstraint({
          name: 'valid_order_amount',
          targetClass: 'orders',
          propertyConstraints: [
            {
              property: 'total_amount',
              minValue: 0,
              message: 'Order amount cannot be negative',
            },
          ],
          severity: 'error',
        });

        const entity = model.entityClasses.get('orders')!;
        const validData = { total_amount: 100 };
        const invalidData = { total_amount: -50 };

        const validResult = constraintValidator.validate(validData, entity, [
          constraint,
        ]);
        expect(validResult.valid).toBe(true);

        const invalidResult = constraintValidator.validate(
          invalidData,
          entity,
          [constraint],
        );
        expect(invalidResult.valid).toBe(false);
      });

      it('should validate email format', () => {
        const constraint = createSemanticConstraint({
          name: 'valid_email',
          targetClass: 'customers',
          propertyConstraints: [
            {
              property: 'email',
              pattern: '^[^@]+@[^@]+\\.[^@]+$',
            },
          ],
          severity: 'error',
        });

        const entity = model.entityClasses.get('customers')!;
        const result = constraintValidator.validate(
          { email: 'invalid' },
          entity,
          [constraint],
        );
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Pillar 3: Caching & Performance', () => {
    describe('3.1 Pre-aggregations', () => {
      it('should support pre-aggregation definitions', () => {
        // Cube.dev: "pre-aggregations for commonly used combinations"
        const viewWithPreAgg = createSemanticView({
          name: 'daily_sales',
          baseEntity: 'orders',
          exposedMetrics: ['revenue'],
          exposedDimensions: ['status', 'created_at'],
          preAggregations: [
            {
              id: 'daily_revenue',
              name: 'Daily Revenue',
              metrics: ['revenue'],
              dimensions: ['status'],
              timeDimension: 'created_at',
              granularity: 'day',
              refreshSchedule: '0 * * * *', // hourly
              partitionGranularity: 'month',
            },
          ],
        });
        model.views.set(viewWithPreAgg.id, viewWithPreAgg);

        const preAgg = viewWithPreAgg.preAggregations?.[0];
        expect(preAgg?.granularity).toBe('day');
        expect(preAgg?.partitionGranularity).toBe('month');
        expect(preAgg?.refreshSchedule).toBeDefined();
      });
    });
  });

  describe('Pillar 4: APIs & Governance', () => {
    describe('4.1 Metadata Introspection', () => {
      it('should provide entity discovery', () => {
        // Cube.dev: "metadata introspection capabilities"
        const entities = Array.from(model.entityClasses.keys());
        expect(entities).toContain('orders');
        expect(entities).toContain('customers');
      });

      it('should provide metric discovery', () => {
        const metrics = Array.from(model.metrics.keys());
        expect(metrics.length).toBeGreaterThan(0);
      });

      it('should provide dimension discovery', () => {
        const dimensions = Array.from(model.dimensions.keys());
        expect(dimensions.length).toBeGreaterThan(0);
      });

      it('should provide relationship discovery', () => {
        expect(model.relationships.length).toBeGreaterThan(0);
        const rel = model.relationships[0];
        expect(rel).toHaveProperty('fromEntity');
        expect(rel).toHaveProperty('toEntity');
        expect(rel).toHaveProperty('joinCondition');
      });
    });

    describe('4.2 AI/LLM Support', () => {
      it('should provide semantic context for AI agents', () => {
        // Cube.dev: "semantic catalog for RAG-style prompt augmentation"

        // Entity descriptions for AI context
        for (const entity of model.entityClasses.values()) {
          expect(entity.description).toBeDefined();
          expect(entity.sourceTable).toBeDefined();
        }

        // Metric definitions for AI reasoning
        for (const metric of model.metrics.values()) {
          expect(metric.expression).toBeDefined();
          expect(metric.description).toBeDefined();
        }
      });

      it('should track inference confidence for explainability', () => {
        // Cube.dev: AI needs to understand what metrics mean
        expect(model.confidenceScore).toBeGreaterThan(0);
        expect(model.inferenceLog.length).toBeGreaterThan(0);

        for (const log of model.inferenceLog) {
          expect(log.confidence).toBeDefined();
          expect(log.method).toBeDefined();
        }
      });

      it('should support synonyms for natural language', () => {
        // Cube.dev: discoverability for human and AI users
        expect(model.synonyms.size).toBeGreaterThan(0);
        expect(model.synonyms.has('revenue')).toBe(true);
      });
    });

    describe('4.3 Query Planning', () => {
      it('should generate SQL from semantic queries', () => {
        const plan = queryPlanner.plan(
          {
            userQuery: 'Show revenue by customer segment',
            intent: {
              metrics: ['revenue'],
              dimensions: ['segment'],
            },
          },
          model,
        );

        const sql = queryPlanner.generateSQL(plan, model);
        expect(sql).toContain('SELECT');
      });

      it('should automatically resolve joins', () => {
        // Query spanning orders and customers
        const plan = queryPlanner.plan(
          {
            userQuery: 'Revenue by country',
            intent: {
              metrics: ['total_amount'],
              dimensions: ['country'],
            },
          },
          model,
        );

        // Should include join between orders and customers
        expect(plan.tables.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Best Practices Validation', () => {
    describe('Single Source of Truth', () => {
      it('should centralize metric definitions', () => {
        // All metrics defined in one place
        const metricCount = model.metrics.size;
        expect(metricCount).toBeGreaterThan(0);

        // Each metric has required tables for dependency tracking
        for (const metric of model.metrics.values()) {
          expect(metric.requiredTables.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Version Control Ready', () => {
      it('should have serializable model format', () => {
        // Model can be serialized for version control
        const serialized = serializeSemanticModel(model);

        expect(serialized.id).toBeDefined();
        expect(serialized.version).toBeDefined();
        expect(serialized.createdAt).toBeDefined();
        expect(typeof serialized.metrics).toBe('object');
      });
    });

    describe('Inference Transparency', () => {
      it('should log all inferences for auditability', () => {
        // Every inferred element should be logged
        expect(model.inferenceLog.length).toBeGreaterThan(0);

        const methods = new Set(model.inferenceLog.map((l) => l.method));
        expect(methods.has('schema')).toBe(true);
      });

      it('should provide confidence scores', () => {
        // All entities have confidence for quality assessment
        for (const entity of model.entityClasses.values()) {
          expect(entity.confidence).toBeGreaterThanOrEqual(0);
          expect(entity.confidence).toBeLessThanOrEqual(1);
        }
      });
    });
  });
});
