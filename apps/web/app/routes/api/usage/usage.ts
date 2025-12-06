import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { DomainException } from '@qwery/domain/exceptions';
import {
  CreateUsageService,
  GetUsageByConversationSlugService,
} from '@qwery/domain/services';
import { createRepositories } from '~/lib/repositories/repositories-factory';

function handleDomainException(error: unknown): Response {
  if (error instanceof DomainException) {
    const status =
      error.code >= 2000 && error.code < 3000
        ? 404
        : error.code >= 400 && error.code < 500
          ? error.code
          : 500;
    return Response.json(
      {
        error: error.message,
        code: error.code,
        data: error.data,
      },
      { status },
    );
  }
  const errorMessage =
    error instanceof Error ? error.message : 'Internal server error';
  return Response.json({ error: errorMessage }, { status: 500 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const repositories = await createRepositories();
  const usageRepository = repositories.usage;
  const conversationRepository = repositories.conversation;

  try {
    // GET /api/usage?conversationSlug=...&userId=... - Get usage by conversation slug
    const url = new URL(request.url);
    const conversationSlug = url.searchParams.get('conversationSlug');
    const userId = url.searchParams.get('userId') || '';

    if (!conversationSlug) {
      return Response.json(
        { error: 'conversationSlug query parameter is required' },
        { status: 400 },
      );
    }

    const useCase = new GetUsageByConversationSlugService(
      usageRepository,
      conversationRepository,
    );
    const usage = await useCase.execute({ conversationSlug, userId });
    return Response.json(usage);
  } catch (error) {
    console.error('Error in usage loader:', error);
    return handleDomainException(error);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const repositories = await createRepositories();
  const usageRepository = repositories.usage;
  const conversationRepository = repositories.conversation;
  const projectRepository = repositories.project;

  try {
    // POST /api/usage - Create usage
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await request.json();
    const { conversationSlug, conversationId, ...input } = body;

    let slug = conversationSlug;

    // If conversationId is provided instead of slug, resolve it
    if (!slug && conversationId) {
      const conversation =
        await conversationRepository.findById(conversationId);
      if (!conversation) {
        return Response.json(
          { error: `Conversation with id '${conversationId}' not found` },
          { status: 404 },
        );
      }
      slug = conversation.slug;
    }

    if (!slug) {
      return Response.json(
        { error: 'conversationSlug or conversationId is required' },
        { status: 400 },
      );
    }

    const useCase = new CreateUsageService(
      usageRepository,
      conversationRepository,
      projectRepository,
    );
    const usage = await useCase.execute({
      input,
      conversationSlug: slug,
    });

    return Response.json(usage, { status: 201 });
  } catch (error) {
    console.error('Error in create-usage action:', error);
    return handleDomainException(error);
  }
}
