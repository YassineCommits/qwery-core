import { useGetMessagesByConversationSlug } from '~/lib/queries/use-get-messages';
import { useGetConversationBySlug } from '~/lib/queries/use-get-conversations';
import Agent from '../_components/agent';
import { useParams } from 'react-router';
import { useWorkspace } from '~/lib/context/workspace-context';
import { LoaderIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AgentUIWrapperRef } from '../_components/agent-ui-wrapper';

export default function ConversationPage() {
  const slug = useParams().slug;
  const { repositories } = useWorkspace();
  const agentRef = useRef<AgentUIWrapperRef>(null);
  const hasAutoSentRef = useRef(false);

  const getMessages = useGetMessagesByConversationSlug(
    repositories.conversation,
    repositories.message,
    slug as string,
  );

  const getConversation = useGetConversationBySlug(
    repositories.conversation,
    slug as string,
  );

  // Reset auto-send flag when conversation changes
  useEffect(() => {
    hasAutoSentRef.current = false;
  }, [slug]);

  // Auto-send seedMessage if conversation has no messages but has a seedMessage
  useEffect(() => {
    if (
      !hasAutoSentRef.current &&
      getMessages.data &&
      getConversation.data &&
      getMessages.data.length === 0 &&
      getConversation.data.seedMessage
    ) {
      hasAutoSentRef.current = true;
      const seedMessage = getConversation.data.seedMessage;
      // Small delay to ensure the agent is ready
      setTimeout(() => {
        if (seedMessage) {
          agentRef.current?.sendMessage(seedMessage);
        }
      }, 100);
    }
  }, [getMessages.data, getConversation.data, slug]);

  return (
    <>
      {(getMessages.isLoading || getConversation.isLoading) && (
        <>
          <LoaderIcon />
        </>
      )}
      {getMessages.data && (
        <Agent
          ref={agentRef}
          conversationSlug={slug as string}
          initialMessages={getMessages.data}
        />
      )}
    </>
  );
}
