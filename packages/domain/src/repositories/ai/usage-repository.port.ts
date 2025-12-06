import { Usage } from '../../entities';
import { RepositoryPort } from '../base-repository.port';

export abstract class IUsageRepository extends RepositoryPort<Usage, string> {
  public abstract findByConversationId(
    conversationId: string,
  ): Promise<Usage[]>;
}
