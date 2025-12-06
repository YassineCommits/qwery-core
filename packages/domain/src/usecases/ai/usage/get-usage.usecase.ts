import { UseCase } from '../../usecase';
import { UsageOutput } from '../../dto';

export type GetUsageByConversationSlugUseCase = UseCase<
  { conversationSlug: string; userId: string },
  UsageOutput[]
>;

export type GetUsageByConversationIdUseCase = UseCase<
  { conversationId: string; userId: string },
  UsageOutput[]
>;
