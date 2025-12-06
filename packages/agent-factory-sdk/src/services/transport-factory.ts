import { defaultTransport } from './default-transport';
import { createBrowserTransport } from './browser-transport';
import { Repositories } from '@qwery/domain/repositories';

export const transportFactory = (
  conversationSlug: string,
  model: string,
  repositories: Repositories,
) => {
  // Handle case where model might not have a provider prefix
  if (!model.includes('/')) {
    return defaultTransport(`/api/chat/${conversationSlug}`);
  }

  const [provider] = model.split('/');

  switch (provider) {
    case 'transformer-browser':
    case 'webllm':
    case 'browser':
      return createBrowserTransport({
        model: model,
        repositories: repositories,
        conversationSlug: conversationSlug,
      });
    default:
      return defaultTransport(`/api/chat/${conversationSlug}`);
  }
};
