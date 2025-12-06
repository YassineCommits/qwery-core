import { useQuery } from '@tanstack/react-query';

import { IConversationRepository } from '@qwery/domain/repositories';
import {
  GetConversationsService,
  GetConversationBySlugService,
} from '@qwery/domain/services';
import { getConversationKey } from '~/lib/mutations/use-conversation';

export function getConversationsKey() {
  return ['conversations'];
}

export function useGetConversations(repository: IConversationRepository) {
  const useCase = new GetConversationsService(repository);
  return useQuery({
    queryKey: getConversationsKey(),
    queryFn: () => useCase.execute(),
    staleTime: 30 * 1000,
  });
}

export function useGetConversationBySlug(
  repository: IConversationRepository,
  slug: string,
) {
  return useQuery({
    queryKey: getConversationKey(slug),
    queryFn: async () => {
      const useCase = new GetConversationBySlugService(repository);
      return useCase.execute(slug);
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
  });
}
