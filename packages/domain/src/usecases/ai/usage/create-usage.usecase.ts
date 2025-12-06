import { CreateUsageInput, UsageOutput } from '../../dto';
import { UseCase } from '../../usecase';

export type CreateUsageUseCase = UseCase<
  { input: CreateUsageInput; conversationSlug: string },
  UsageOutput
>;
