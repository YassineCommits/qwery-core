import { RepositoryFindOptions } from '@qwery/domain/common';
import type { Usage } from '@qwery/domain/entities';
import { IUsageRepository } from '@qwery/domain/repositories';
import { apiDelete, apiGet, apiPost, apiPut } from './api-client';

export class UsageRepository extends IUsageRepository {
  async findAll(_options?: RepositoryFindOptions): Promise<Usage[]> {
    const result = await apiGet<Usage[]>('/usage', false);
    return result || [];
  }

  async findById(id: string): Promise<Usage | null> {
    return apiGet<Usage>(`/usage/${id}`, true);
  }

  async findBySlug(_slug: string): Promise<Usage | null> {
    // Usage doesn't have slugs, but we need to implement this for the interface
    return null;
  }

  async findByConversationId(conversationId: string): Promise<Usage[]> {
    const result = await apiGet<Usage[]>(
      `/usage?conversationId=${conversationId}`,
      true,
    );
    return result || [];
  }

  async create(entity: Usage): Promise<Usage> {
    // Extract CreateUsageInput from Usage entity
    // The service will set conversationId, projectId, organizationId from conversationSlug
    const {
      id: _id,
      conversationId,
      projectId: _projectId,
      organizationId: _organizationId,
      ...input
    } = entity;

    // Call the API with conversationId (API will resolve to slug internally)
    const result = await apiPost<Usage>('/usage', {
      conversationId,
      userId: input.userId,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      reasoningTokens: input.reasoningTokens,
      cachedInputTokens: input.cachedInputTokens,
      contextSize: input.contextSize,
      creditsCap: input.creditsCap,
      creditsUsed: input.creditsUsed,
      cpu: input.cpu,
      memory: input.memory,
      network: input.network,
      gpu: input.gpu,
      storage: input.storage,
    });

    return result;
  }

  async update(entity: Usage): Promise<Usage> {
    return apiPut<Usage>(`/usage/${entity.id}`, entity);
  }

  async delete(id: string): Promise<boolean> {
    return apiDelete(`/usage/${id}`);
  }
}
