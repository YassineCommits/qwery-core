import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatasourceOrchestrationService } from '../../src/tools/datasource-orchestration-service';
import type { Repositories } from '@qwery/domain/repositories';
import type { AbstractQueryEngine } from '@qwery/domain/ports';
import type { Datasource } from '@qwery/domain/entities';
import * as datasourceLoader from '../../src/tools/datasource-loader';

describe('DatasourceOrchestrationService', () => {
  let service: DatasourceOrchestrationService;
  let mockRepositories: Repositories;
  let mockQueryEngine: AbstractQueryEngine;
  const mockWorkspace = '/tmp/test-workspace';

  beforeEach(() => {
    service = new DatasourceOrchestrationService();

    // Mock workspace environment
    process.env.WORKSPACE = mockWorkspace;

    // Mock loadDatasources
    vi.spyOn(datasourceLoader, 'loadDatasources').mockResolvedValue([]);

    // Mock repositories
    mockRepositories = {
      conversation: {
        findBySlug: vi.fn(),
      } as unknown as Repositories['conversation'],
      datasource: {
        findByIds: vi.fn(),
      } as unknown as Repositories['datasource'],
    } as Repositories;

    // Mock query engine
    mockQueryEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      attach: vi.fn().mockResolvedValue(undefined),
      metadata: vi.fn().mockResolvedValue({
        schemas: [],
        tables: [],
        columns: [],
      }),
      query: vi.fn(),
    } as unknown as AbstractQueryEngine;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.WORKSPACE;
  });

  describe('orchestrate', () => {
    it('should throw error if WORKSPACE is not set', async () => {
      delete process.env.WORKSPACE;
      delete process.env.VITE_WORKING_DIR;
      delete process.env.WORKING_DIR;

      await expect(
        service.orchestrate({
          conversationId: 'test-conv',
          repositories: mockRepositories,
          queryEngine: mockQueryEngine,
        }),
      ).rejects.toThrow('WORKSPACE environment variable is not set');
    });

    it('should handle missing conversation gracefully', async () => {
      (
        mockRepositories.conversation.findBySlug as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Not found'));

      const result = await service.orchestrate({
        conversationId: 'non-existent',
        repositories: mockRepositories,
        queryEngine: mockQueryEngine,
      });

      expect(result.conversation).toBeNull();
      expect(result.datasources).toEqual([]);
      expect(result.workspace).toBe(mockWorkspace);
    });

    it('should prioritize metadata datasources over conversation datasources', async () => {
      const conversation = {
        id: 'conv-1',
        datasources: ['ds-1', 'ds-2'],
      };
      (
        mockRepositories.conversation.findBySlug as ReturnType<typeof vi.fn>
      ).mockResolvedValue(conversation);
      const mockLoadedDatasource = {
        datasource: {
          id: 'ds-3',
          datasource_provider: 'postgresql',
        } as Datasource,
      };
      vi.spyOn(datasourceLoader, 'loadDatasources').mockResolvedValue([
        mockLoadedDatasource,
      ]);

      await service.orchestrate({
        conversationId: 'conv-1',
        repositories: mockRepositories,
        queryEngine: mockQueryEngine,
        metadataDatasources: ['ds-3'],
      });

      expect(datasourceLoader.loadDatasources).toHaveBeenCalledWith(
        ['ds-3'],
        mockRepositories.datasource,
      );
    });

    it('should use conversation datasources when metadata datasources are not provided', async () => {
      const conversation = {
        id: 'conv-1',
        datasources: ['ds-1', 'ds-2'],
      };
      (
        mockRepositories.conversation.findBySlug as ReturnType<typeof vi.fn>
      ).mockResolvedValue(conversation);
      const mockLoadedDatasources = [
        {
          datasource: {
            id: 'ds-1',
            datasource_provider: 'postgresql',
          } as Datasource,
        },
        {
          datasource: {
            id: 'ds-2',
            datasource_provider: 'mysql',
          } as Datasource,
        },
      ];
      vi.spyOn(datasourceLoader, 'loadDatasources').mockResolvedValue(
        mockLoadedDatasources,
      );

      await service.orchestrate({
        conversationId: 'conv-1',
        repositories: mockRepositories,
        queryEngine: mockQueryEngine,
      });

      expect(datasourceLoader.loadDatasources).toHaveBeenCalledWith(
        ['ds-1', 'ds-2'],
        mockRepositories.datasource,
      );
    });

    it('should initialize engine and attach datasources', async () => {
      const conversation = {
        id: 'conv-1',
        datasources: ['ds-1'],
      };
      const mockDatasource = {
        id: 'ds-1',
        name: 'Test Datasource',
        datasource_provider: 'postgresql',
      } as Datasource;

      (
        mockRepositories.conversation.findBySlug as ReturnType<typeof vi.fn>
      ).mockResolvedValue(conversation);
      const mockLoadedDatasource = { datasource: mockDatasource };
      vi.spyOn(datasourceLoader, 'loadDatasources').mockResolvedValue([
        mockLoadedDatasource,
      ]);

      const result = await service.orchestrate({
        conversationId: 'conv-1',
        repositories: mockRepositories,
        queryEngine: mockQueryEngine,
      });

      expect(mockQueryEngine.initialize).toHaveBeenCalled();
      expect(mockQueryEngine.attach).toHaveBeenCalledWith([mockDatasource], {
        conversationId: 'conv-1',
        workspace: mockWorkspace,
      });
      expect(mockQueryEngine.connect).toHaveBeenCalled();
      expect(result.attached).toBe(true);
    });

    it('should initialize engine even when no datasources are provided', async () => {
      const conversation = {
        id: 'conv-1',
        datasources: [],
      };
      (
        mockRepositories.conversation.findBySlug as ReturnType<typeof vi.fn>
      ).mockResolvedValue(conversation);

      const result = await service.orchestrate({
        conversationId: 'conv-1',
        repositories: mockRepositories,
        queryEngine: mockQueryEngine,
      });

      expect(mockQueryEngine.initialize).toHaveBeenCalled();
      expect(mockQueryEngine.connect).toHaveBeenCalled();
      expect(result.datasources).toEqual([]);
      expect(result.attached).toBe(false);
    });
  });

  describe('ensureAttachedAndCached', () => {
    it('should use existing result if all datasources are cached', async () => {
      const existingResult = {
        conversation: { id: 'conv-1', datasources: ['ds-1'] },
        datasources: [
          {
            datasource: {
              id: 'ds-1',
              datasource_provider: 'postgresql',
            } as Datasource,
          },
        ],
        workspace: mockWorkspace,
        schemaCache: {
          isCached: vi.fn().mockReturnValue(true),
          getDatasources: vi.fn().mockReturnValue(['ds-1']),
        } as unknown as {
          isCached: (id: string) => boolean;
          getDatasources: () => string[];
          loadSchemaForDatasource?: () => Promise<void>;
        },
        attached: true,
      };

      const mockLoadedDatasource = {
        datasource: {
          id: 'ds-1',
          datasource_provider: 'postgresql',
        } as Datasource,
      };
      vi.spyOn(datasourceLoader, 'loadDatasources').mockResolvedValue([
        mockLoadedDatasource,
      ]);

      await service.ensureAttachedAndCached(
        {
          conversationId: 'conv-1',
          repositories: mockRepositories,
          queryEngine: mockQueryEngine,
        },
        existingResult,
      );

      expect(mockQueryEngine.metadata).not.toHaveBeenCalled();
      expect(mockQueryEngine.attach).toHaveBeenCalled();
    });

    it('should sync and cache uncached datasources', async () => {
      const existingResult = {
        conversation: { id: 'conv-1', datasources: ['ds-1'] },
        datasources: [],
        workspace: mockWorkspace,
        schemaCache: {
          isCached: vi.fn().mockReturnValue(false),
          getDatasources: vi.fn().mockReturnValue([]),
          loadSchemaForDatasource: vi.fn().mockResolvedValue(undefined),
        } as unknown as {
          isCached: (id: string) => boolean;
          getDatasources: () => string[];
          loadSchemaForDatasource: () => Promise<void>;
        },
        attached: false,
      };

      const mockDatasource = {
        id: 'ds-1',
        name: 'Test Datasource',
        datasource_provider: 'postgresql',
      } as Datasource;

      const mockLoadedDatasource = { datasource: mockDatasource };
      vi.spyOn(datasourceLoader, 'loadDatasources').mockResolvedValue([
        mockLoadedDatasource,
      ]);

      await service.ensureAttachedAndCached(
        {
          conversationId: 'conv-1',
          repositories: mockRepositories,
          queryEngine: mockQueryEngine,
        },
        existingResult,
      );

      expect(mockQueryEngine.attach).toHaveBeenCalled();
      expect(mockQueryEngine.metadata).toHaveBeenCalled();
      expect(
        existingResult.schemaCache.loadSchemaForDatasource,
      ).toHaveBeenCalled();
    });
  });
});
