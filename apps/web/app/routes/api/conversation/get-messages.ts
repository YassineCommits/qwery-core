import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { DomainException } from '@qwery/domain/exceptions';
import {
  CreateMessageService,
  GetMessagesByConversationSlugService,
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
  const messageRepository = repositories.message;
  const conversationRepository = repositories.conversation;

  try {
    // GET /api/messages?conversationSlug=... - Get messages by conversation slug
    const url = new URL(request.url);
    const conversationSlug = url.searchParams.get('conversationSlug');

    if (!conversationSlug) {
      return Response.json(
        { error: 'conversationSlug query parameter is required' },
        { status: 400 },
      );
    }

    // Use the service to get messages by slug
    // The service validates the conversation and gets messages
    const useCase = new GetMessagesByConversationSlugService(
      messageRepository,
      conversationRepository,
    );
    const messages = await useCase.execute({ conversationSlug });
    return Response.json(messages);
  } catch (error) {
    console.error('Error in get-messages loader:', error);
    return handleDomainException(error);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const repositories = await createRepositories();
  const messageRepository = repositories.message;
  const conversationRepository = repositories.conversation;

  try {
    // POST /api/messages - Create message
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

    if (!input.content || !input.role || !input.createdBy) {
      return Response.json(
        { error: 'content, role, and createdBy are required' },
        { status: 400 },
      );
    }

    const useCase = new CreateMessageService(
      messageRepository,
      conversationRepository,
    );
    const message = await useCase.execute({
      input,
      conversationSlug: slug,
    });

    return Response.json(message, { status: 201 });
  } catch (error) {
    console.error('Error in create-message action:', error);
    return handleDomainException(error);
  }
}
