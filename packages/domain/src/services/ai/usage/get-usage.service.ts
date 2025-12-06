import { Code } from '../../../common/code';
import { DomainException } from '../../../exceptions';
import {
  IConversationRepository,
  IUsageRepository,
} from '../../../repositories';
import { GetUsageByConversationSlugUseCase } from '../../../usecases/ai/usage/get-usage.usecase';
import { UsageOutput } from '../../../usecases';

export class GetUsageByConversationSlugService
  implements GetUsageByConversationSlugUseCase
{
  constructor(
    private readonly usageRepository: IUsageRepository,
    private readonly conversationRepository: IConversationRepository,
  ) {}

  public async execute({
    conversationSlug,
    userId: _userId,
  }: {
    conversationSlug: string;
    userId: string;
  }): Promise<UsageOutput[]> {
    const conversation =
      await this.conversationRepository.findBySlug(conversationSlug);
    if (!conversation) {
      throw DomainException.new({
        code: Code.CONVERSATION_NOT_FOUND_ERROR,
        overrideMessage: `Conversation with slug '${conversationSlug}' not found`,
        data: { conversationSlug },
      });
    }

    const usageRecords = await this.usageRepository.findByConversationId(
      conversation.id,
    );

    return usageRecords.map((usage) => UsageOutput.new(usage));
  }
}
