'use client';

import { useRef, memo, useMemo } from 'react';
import { MessageResponse } from '../../ai-elements/message';
import type { UIMessage } from 'ai';
import type { useChat } from '@ai-sdk/react';
import { cn } from '../../lib/utils';
import { getContextMessages } from './utils/message-context';
import { useStreamdownReady } from './hooks/use-streamdown-ready';
import { useDebouncedValue } from './hooks/use-debounced-value';
import { useSuggestionDetection } from './hooks/use-suggestion-detection';
import { useSuggestionEnhancement } from './hooks/use-suggestion-enhancement';

export interface StreamdownWithSuggestionsProps {
  children: string;
  className?: string;
  sendMessage?: ReturnType<typeof useChat>['sendMessage'];
  messages?: UIMessage[];
  currentMessageId?: string;
}

export const StreamdownWithSuggestions = memo(
  ({
    className,
    children,
    sendMessage,
    messages,
    currentMessageId,
  }: StreamdownWithSuggestionsProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const contextMessages = useMemo(
      () => getContextMessages(messages, currentMessageId),
      [messages, currentMessageId],
    );

    const isStreamdownReady = useStreamdownReady(containerRef);
    const debouncedChildren = useDebouncedValue(children, 150);

    const detectedSuggestions = useSuggestionDetection(containerRef, isStreamdownReady);

    useSuggestionEnhancement({
      detectedSuggestions,
      containerRef,
      sendMessage,
      contextMessages,
    });

    return (
      <div ref={containerRef} className={cn('min-w-0 max-w-full overflow-hidden', className)} style={{ maxWidth: '100%', overflowX: 'hidden' }}>
        <MessageResponse>{children}</MessageResponse>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.sendMessage === nextProps.sendMessage &&
    prevProps.messages === nextProps.messages &&
    prevProps.currentMessageId === nextProps.currentMessageId,
);

StreamdownWithSuggestions.displayName = 'StreamdownWithSuggestions';

