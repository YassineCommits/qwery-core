import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';

import type {
  Usage,
  Conversation,
  Project,
  Organization,
} from '@qwery/domain/entities';

import { UsageRepository } from '../src/usage.repository';
import { ConversationRepository } from '../src/conversation.repository';
import { ProjectRepository } from '../src/project.repository';
import { OrganizationRepository } from '../src/organization.repository';

describe('UsageRepository', () => {
  let repository: UsageRepository;
  let conversationRepository: ConversationRepository;
  let projectRepository: ProjectRepository;
  let organizationRepository: OrganizationRepository;
  let testDbPath: string;
  let testProjectId: string;
  let testConversationId: string;
  let testOrgId: string;

  beforeEach(async () => {
    testDbPath = join(
      tmpdir(),
      `test-usage-${Date.now()}-${Math.random().toString(36).substring(7)}.db`,
    );

    // Create repositories (they all use the same database)
    organizationRepository = new OrganizationRepository(testDbPath);
    projectRepository = new ProjectRepository(testDbPath);
    conversationRepository = new ConversationRepository(testDbPath);
    repository = new UsageRepository(testDbPath);

    // Create a test organization
    testOrgId = uuidv4();
    const testOrganization: Organization = {
      id: testOrgId,
      name: 'Test Organization',
      slug: 'test-org',
      is_owner: false,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      createdBy: 'test-user',
      updatedBy: 'test-user',
    };
    await organizationRepository.create(testOrganization);

    // Create a test project
    testProjectId = uuidv4();
    const testProject: Project = {
      id: testProjectId,
      org_id: testOrgId,
      name: 'Test Project',
      slug: 'test-project',
      description: 'Test Description',
      status: 'active',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      createdBy: 'test-user',
      updatedBy: 'test-user',
    };
    await projectRepository.create(testProject);

    // Create a test conversation
    testConversationId = uuidv4();
    const testConversation: Conversation = {
      id: testConversationId,
      slug: 'test-conversation',
      title: 'Test Conversation',
      projectId: testProjectId,
      taskId: uuidv4(),
      datasources: [],
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      createdBy: 'test-user',
      updatedBy: 'test-user',
    };
    await conversationRepository.create(testConversation);
  });

  afterEach(async () => {
    await repository.close();
    await conversationRepository.close();
    await projectRepository.close();
    await organizationRepository.close();
    try {
      unlinkSync(testDbPath);
    } catch {
      // File might not exist, ignore
    }
  });

  const createTestUsage = (overrides?: Partial<Usage>): Usage => {
    const id = overrides?.id || Date.now();
    return {
      id,
      conversationId: overrides?.conversationId || testConversationId,
      projectId: overrides?.projectId || testProjectId,
      organizationId: overrides?.organizationId || testOrgId,
      userId: overrides?.userId || 'test-user-id',
      model: overrides?.model || 'gpt-4',
      inputTokens: overrides?.inputTokens ?? 100,
      outputTokens: overrides?.outputTokens ?? 50,
      totalTokens: overrides?.totalTokens ?? 150,
      reasoningTokens: overrides?.reasoningTokens ?? 0,
      cachedInputTokens: overrides?.cachedInputTokens ?? 0,
      contextSize: overrides?.contextSize ?? 8192,
      creditsCap: overrides?.creditsCap ?? 1000,
      creditsUsed: overrides?.creditsUsed ?? 10,
      cpu: overrides?.cpu ?? 0.5,
      memory: overrides?.memory ?? 0.3,
      network: overrides?.network ?? 0.1,
      gpu: overrides?.gpu ?? 0.2,
      storage: overrides?.storage ?? 0.05,
      ...overrides,
    };
  };

  describe('create', () => {
    it('should create a new usage record', async () => {
      const usage = createTestUsage();
      const result = await repository.create(usage);

      expect(result.id).toBe(usage.id);
      expect(result.conversationId).toBe(usage.conversationId);
      expect(result.projectId).toBe(usage.projectId);
      expect(result.organizationId).toBe(usage.organizationId);
      expect(result.userId).toBe(usage.userId);
      expect(result.model).toBe(usage.model);
      expect(result.inputTokens).toBe(usage.inputTokens);
      expect(result.outputTokens).toBe(usage.outputTokens);
      expect(result.totalTokens).toBe(usage.totalTokens);
    });

    it('should automatically generate id when not provided', async () => {
      const usage = createTestUsage({ id: 0 });
      const result = await repository.create(usage);

      expect(result.id).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
    });

    it('should throw error when creating duplicate usage', async () => {
      const usage = createTestUsage();
      await repository.create(usage);

      await expect(repository.create(usage)).rejects.toThrow('already exists');
    });

    it('should store all usage metrics correctly', async () => {
      const usage = createTestUsage({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        reasoningTokens: 50,
        cachedInputTokens: 25,
        contextSize: 16384,
        creditsCap: 2000,
        creditsUsed: 20,
        cpu: 1.5,
        memory: 0.8,
        network: 0.3,
        gpu: 0.5,
        storage: 0.1,
      });

      const result = await repository.create(usage);

      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(100);
      expect(result.totalTokens).toBe(300);
      expect(result.reasoningTokens).toBe(50);
      expect(result.cachedInputTokens).toBe(25);
      expect(result.contextSize).toBe(16384);
      expect(result.creditsCap).toBe(2000);
      expect(result.creditsUsed).toBe(20);
      expect(result.cpu).toBe(1.5);
      expect(result.memory).toBe(0.8);
      expect(result.network).toBe(0.3);
      expect(result.gpu).toBe(0.5);
      expect(result.storage).toBe(0.1);
    });
  });

  describe('findById', () => {
    it('should find a usage record by id', async () => {
      const usage = createTestUsage();
      await repository.create(usage);

      const result = await repository.findById(usage.id.toString());

      expect(result).not.toBeNull();
      expect(result?.id).toBe(usage.id);
      expect(result?.conversationId).toBe(usage.conversationId);
    });

    it('should return null when usage does not exist', async () => {
      const result = await repository.findById('9999999999999');

      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should return null (usage does not have slugs)', async () => {
      const result = await repository.findBySlug('test-slug');

      expect(result).toBeNull();
    });
  });

  describe('findByConversationId', () => {
    it('should find all usage records for a conversation', async () => {
      const usage1 = createTestUsage({ id: Date.now() });
      const usage2 = createTestUsage({ id: Date.now() + 1000 });
      const usage3 = createTestUsage({ id: Date.now() + 2000 });

      await repository.create(usage1);
      await repository.create(usage2);
      await repository.create(usage3);

      const result = await repository.findByConversationId(testConversationId);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toContain(usage1.id);
      expect(result.map((r) => r.id)).toContain(usage2.id);
      expect(result.map((r) => r.id)).toContain(usage3.id);
    });

    it('should return usage records ordered by id DESC (newest first)', async () => {
      const now = Date.now();
      const usage1 = createTestUsage({ id: now });
      const usage2 = createTestUsage({ id: now + 1000 });
      const usage3 = createTestUsage({ id: now + 2000 });

      await repository.create(usage1);
      await repository.create(usage2);
      await repository.create(usage3);

      const result = await repository.findByConversationId(testConversationId);

      expect(result).toHaveLength(3);
      // Should be ordered DESC (newest first)
      expect(result[0]?.id).toBe(usage3.id);
      expect(result[1]?.id).toBe(usage2.id);
      expect(result[2]?.id).toBe(usage1.id);
    });

    it('should return empty array when conversation has no usage', async () => {
      const newConversationId = uuidv4();
      const newConversation: Conversation = {
        id: newConversationId,
        slug: 'new-conversation',
        title: 'New Conversation',
        projectId: testProjectId,
        taskId: uuidv4(),
        datasources: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        createdBy: 'test-user',
        updatedBy: 'test-user',
      };
      await conversationRepository.create(newConversation);

      const result = await repository.findByConversationId(newConversationId);

      expect(result).toHaveLength(0);
    });

    it('should only return usage for the specified conversation', async () => {
      const newConversationId = uuidv4();
      const newConversation: Conversation = {
        id: newConversationId,
        slug: 'new-conversation',
        title: 'New Conversation',
        projectId: testProjectId,
        taskId: uuidv4(),
        datasources: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        createdBy: 'test-user',
        updatedBy: 'test-user',
      };
      await conversationRepository.create(newConversation);

      const now = Date.now();
      const usage1 = createTestUsage({
        id: now,
        conversationId: testConversationId,
      });
      const usage2 = createTestUsage({
        id: now + 1000,
        conversationId: newConversationId,
      });

      await repository.create(usage1);
      await repository.create(usage2);

      const result = await repository.findByConversationId(testConversationId);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(usage1.id);
    });
  });

  describe('findAll', () => {
    it('should find all usage records', async () => {
      const usage1 = createTestUsage({ id: Date.now() });
      const usage2 = createTestUsage({ id: Date.now() + 1000 });

      await repository.create(usage1);
      await repository.create(usage2);

      const result = await repository.findAll();

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.map((r) => r.id)).toContain(usage1.id);
      expect(result.map((r) => r.id)).toContain(usage2.id);
    });

    it('should return usage records ordered by id DESC by default', async () => {
      const now = Date.now();
      const usage1 = createTestUsage({ id: now });
      const usage2 = createTestUsage({ id: now + 1000 });
      const usage3 = createTestUsage({ id: now + 2000 });

      await repository.create(usage1);
      await repository.create(usage2);
      await repository.create(usage3);

      const result = await repository.findAll();

      const usageIds = result.map((r) => r.id);
      const usage1Index = usageIds.indexOf(usage1.id);
      const usage2Index = usageIds.indexOf(usage2.id);
      const usage3Index = usageIds.indexOf(usage3.id);

      // usage3 should come before usage2, and usage2 before usage1
      expect(usage3Index).toBeLessThan(usage2Index);
      expect(usage2Index).toBeLessThan(usage1Index);
    });

    it('should respect limit option', async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await repository.create(createTestUsage({ id: now + i * 1000 }));
      }

      const result = await repository.findAll({ limit: 3 });

      expect(result).toHaveLength(3);
    });

    it('should respect offset option', async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await repository.create(createTestUsage({ id: now + i * 1000 }));
      }

      const result = await repository.findAll({ offset: 2 });

      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('update', () => {
    it('should update an existing usage record', async () => {
      const usage = createTestUsage();
      await repository.create(usage);

      const updated = {
        ...usage,
        inputTokens: 500,
        outputTokens: 250,
        totalTokens: 750,
        creditsUsed: 50,
      };

      const result = await repository.update(updated);

      expect(result.inputTokens).toBe(500);
      expect(result.outputTokens).toBe(250);
      expect(result.totalTokens).toBe(750);
      expect(result.creditsUsed).toBe(50);
    });

    it('should throw error when updating non-existent usage', async () => {
      const usage = createTestUsage({ id: 9999999999999 });

      await expect(repository.update(usage)).rejects.toThrow('not found');
    });

    it('should update all usage metrics', async () => {
      const usage = createTestUsage();
      await repository.create(usage);

      const updated = {
        ...usage,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        reasoningTokens: 100,
        cachedInputTokens: 50,
        contextSize: 32768,
        creditsCap: 5000,
        creditsUsed: 100,
        cpu: 2.5,
        memory: 1.5,
        network: 0.5,
        gpu: 1.0,
        storage: 0.2,
      };

      const result = await repository.update(updated);

      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.totalTokens).toBe(1500);
      expect(result.reasoningTokens).toBe(100);
      expect(result.cachedInputTokens).toBe(50);
      expect(result.contextSize).toBe(32768);
      expect(result.creditsCap).toBe(5000);
      expect(result.creditsUsed).toBe(100);
      expect(result.cpu).toBe(2.5);
      expect(result.memory).toBe(1.5);
      expect(result.network).toBe(0.5);
      expect(result.gpu).toBe(1.0);
      expect(result.storage).toBe(0.2);
    });
  });

  describe('delete', () => {
    it('should delete a usage record by id', async () => {
      const usage = createTestUsage();
      await repository.create(usage);

      const result = await repository.delete(usage.id.toString());

      expect(result).toBe(true);

      const found = await repository.findById(usage.id.toString());
      expect(found).toBeNull();
    });

    it('should return false when usage does not exist', async () => {
      const result = await repository.delete('9999999999999');

      expect(result).toBe(false);
    });
  });

  describe('time series behavior', () => {
    it('should store multiple usage records with different timestamps', async () => {
      const now = Date.now();
      const usage1 = createTestUsage({ id: now, inputTokens: 100 });
      const usage2 = createTestUsage({ id: now + 1000, inputTokens: 200 });
      const usage3 = createTestUsage({ id: now + 2000, inputTokens: 300 });

      await repository.create(usage1);
      await repository.create(usage2);
      await repository.create(usage3);

      const result = await repository.findByConversationId(testConversationId);

      expect(result).toHaveLength(3);
      // Verify they are stored with correct timestamps
      expect(result.map((r) => r.id)).toContain(now);
      expect(result.map((r) => r.id)).toContain(now + 1000);
      expect(result.map((r) => r.id)).toContain(now + 2000);
    });

    it('should maintain time series ordering across multiple conversations', async () => {
      const newConversationId = uuidv4();
      const newConversation: Conversation = {
        id: newConversationId,
        slug: 'new-conversation',
        title: 'New Conversation',
        projectId: testProjectId,
        taskId: uuidv4(),
        datasources: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        createdBy: 'test-user',
        updatedBy: 'test-user',
      };
      await conversationRepository.create(newConversation);

      const now = Date.now();
      const usage1 = createTestUsage({
        id: now,
        conversationId: testConversationId,
      });
      const usage2 = createTestUsage({
        id: now + 1000,
        conversationId: newConversationId,
      });
      const usage3 = createTestUsage({
        id: now + 2000,
        conversationId: testConversationId,
      });

      await repository.create(usage1);
      await repository.create(usage2);
      await repository.create(usage3);

      const result1 = await repository.findByConversationId(testConversationId);
      const result2 = await repository.findByConversationId(newConversationId);

      expect(result1).toHaveLength(2);
      expect(result1[0]?.id).toBe(usage3.id);
      expect(result1[1]?.id).toBe(usage1.id);

      expect(result2).toHaveLength(1);
      expect(result2[0]?.id).toBe(usage2.id);
    });
  });

  describe('integration', () => {
    it('should handle full CRUD lifecycle', async () => {
      const usage = createTestUsage();

      const created = await repository.create(usage);
      expect(created.id).toBe(usage.id);

      const found = await repository.findById(usage.id.toString());
      expect(found?.id).toBe(usage.id);
      expect(found?.conversationId).toBe(usage.conversationId);

      const updated = {
        ...usage,
        inputTokens: 999,
        creditsUsed: 99,
      };
      const updatedResult = await repository.update(updated);
      expect(updatedResult.inputTokens).toBe(999);
      expect(updatedResult.creditsUsed).toBe(99);

      const deleted = await repository.delete(usage.id.toString());
      expect(deleted).toBe(true);

      const foundAfterDelete = await repository.findById(usage.id.toString());
      expect(foundAfterDelete).toBeNull();
    });

    it('should handle cascade delete when conversation is deleted', async () => {
      const usage = createTestUsage();
      await repository.create(usage);

      // Delete the conversation (should cascade delete usage)
      await conversationRepository.delete(testConversationId);

      const found = await repository.findById(usage.id.toString());
      expect(found).toBeNull();
    });
  });
});
