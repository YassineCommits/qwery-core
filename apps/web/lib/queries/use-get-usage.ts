import { useQuery } from '@tanstack/react-query';
import { apiGet } from '~/lib/repositories/api-client';
import { UsageOutput } from '@qwery/domain/usecases';

export function getUsageKey(conversationSlug: string, userId?: string) {
  return ['usage', 'conversation', conversationSlug, userId].filter(Boolean);
}

export function useGetUsage(conversationSlug: string, userId?: string) {
  return useQuery({
    queryKey: getUsageKey(conversationSlug, userId),
    queryFn: async () => {
      const params = new URLSearchParams({ conversationSlug });
      if (userId) {
        params.set('userId', userId);
      }
      const result = await apiGet<UsageOutput[]>(
        `/usage?${params.toString()}`,
        false,
      );
      return result || [];
    },
    staleTime: 30 * 1000,
    enabled: !!conversationSlug,
  });
}
