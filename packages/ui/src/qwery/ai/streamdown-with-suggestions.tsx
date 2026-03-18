'use client';

import { useRef, memo, useMemo, useCallback, useEffect, useState } from 'react';
import { MessageResponse } from '../../ai-elements/message';
import type { UIMessage } from 'ai';
import type { useChat } from '@ai-sdk/react';
import { cn } from '../../lib/utils';
import { getContextMessages } from './utils/message-context';
import { useStreamdownReady } from './hooks/use-streamdown-ready';
import { useDebouncedValue } from './hooks/use-debounced-value';
import { useSuggestionDetection } from './hooks/use-suggestion-detection';
import { useSuggestionEnhancement } from './hooks/use-suggestion-enhancement';
import {
  preprocessSuggestionsForRendering,
  type SuggestionMetadata,
} from './utils/suggestion-pattern';
import {
  extractDataAnalysisRequests,
  DATA_ANALYSIS_CONSENT_END,
  DATA_ANALYSIS_CONSENT_START,
  type DataAnalysisRequest,
} from './utils/data-analysis-request';

const QWERY_DATASOURCE_PREFIX = 'qwery-datasource:';
const BLOCKED_TITLE_PREFIX = 'Blocked URL: ';

function replaceBlockedDatasourceSpans(
  container: HTMLElement,
  onDatasourceNameClick: ((id: string, name: string) => void) | undefined,
  getDatasourceTooltip: ((id: string) => string) | undefined,
) {
  if (!onDatasourceNameClick) return;
  const spans = container.querySelectorAll<HTMLSpanElement>(
    `span[title^="${BLOCKED_TITLE_PREFIX}${QWERY_DATASOURCE_PREFIX}"]`,
  );
  spans.forEach((span) => {
    const title = span.getAttribute('title');
    if (!title) return;
    const href = title.slice(BLOCKED_TITLE_PREFIX.length).trim();
    const id = href.startsWith(QWERY_DATASOURCE_PREFIX)
      ? href.slice(QWERY_DATASOURCE_PREFIX.length).trim()
      : '';
    if (!id) return;
    const name = (span.textContent ?? '')
      .replace(/\s*\[blocked\]\s*$/i, '')
      .trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-qwery-datasource-id', id);
    button.setAttribute('data-qwery-datasource-name', name);
    button.textContent = name || id;
    const tooltip = getDatasourceTooltip?.(id) ?? name;
    if (tooltip) button.title = tooltip;
    button.className = cn(
      'text-primary decoration-primary/50 hover:decoration-primary',
      'overflow-wrap-anywhere cursor-pointer break-words underline underline-offset-2',
      'font-inherit border-0 bg-transparent p-0 text-inherit transition',
    );
    span.parentNode?.replaceChild(button, span);
  });
}

export interface StreamdownWithSuggestionsProps {
  children: string;
  className?: string;
  sendMessage?: ReturnType<typeof useChat>['sendMessage'];
  messages?: UIMessage[];
  currentMessageId?: string;
  scrollToBottom?: () => void;
  disabled?: boolean;
  isLastAgentResponse?: boolean;
  onBeforeSuggestionSend?: (
    text: string,
    metadata?: SuggestionMetadata,
  ) => Promise<boolean>;
  onDatasourceNameClick?: (id: string, name: string) => void;
  getDatasourceTooltip?: (id: string) => string;
}

export const StreamdownWithSuggestions = memo(
  ({
    className,
    children,
    sendMessage,
    messages,
    currentMessageId,
    scrollToBottom,
    disabled = false,
    isLastAgentResponse = true,
    onBeforeSuggestionSend,
    onDatasourceNameClick,
    getDatasourceTooltip,
  }: StreamdownWithSuggestionsProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const setContainerRef = useCallback((node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
      setContainerEl(node);
    }, []);

    const contextMessages = useMemo(
      () => getContextMessages(messages, currentMessageId, children),
      [messages, currentMessageId, children],
    );

    const isStreamdownReady = useStreamdownReady(containerRef);
    const debouncedChildren = useDebouncedValue(children, 150);

    const detectedSuggestions = useSuggestionDetection({
      containerElement: containerEl,
      isReady: isStreamdownReady,
      contentKey: debouncedChildren,
    });

    useSuggestionEnhancement({
      detectedSuggestions,
      containerElement: containerEl,
      sendMessage,
      contextMessages,
      scrollToBottom,
      disabled,
      isLastAgentResponse,
      onBeforeSuggestionSend,
    });

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const run = () =>
        replaceBlockedDatasourceSpans(
          container,
          onDatasourceNameClick,
          getDatasourceTooltip,
        );
      run();
      const id = requestAnimationFrame(run);
      const t = setTimeout(run, 100);
      return () => {
        cancelAnimationFrame(id);
        clearTimeout(t);
      };
    }, [children, onDatasourceNameClick, getDatasourceTooltip]);

    const handleContainerClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const datasourceButton = target.closest<HTMLElement>(
          '[data-qwery-datasource-id]',
        );
        if (datasourceButton) {
          e.preventDefault();
          e.stopPropagation();
          const id = datasourceButton.getAttribute('data-qwery-datasource-id');
          const name =
            datasourceButton.getAttribute('data-qwery-datasource-name') ?? '';
          if (id && onDatasourceNameClick) {
            onDatasourceNameClick(id, name);
          }
          return;
        }
        const link = target.closest('a');
        const href = link?.getAttribute?.('href');
        if (
          link &&
          typeof href === 'string' &&
          href.startsWith(QWERY_DATASOURCE_PREFIX)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const id = href.slice(QWERY_DATASOURCE_PREFIX.length).trim();
          const name = (link.textContent || '').trim();
          if (id && onDatasourceNameClick) {
            onDatasourceNameClick(id, name);
          }
        }
      },
      [onDatasourceNameClick],
    );

    const { text: withRequestPlaceholders, requests } = useMemo(
      () => extractDataAnalysisRequests(children),
      [children],
    );

    const preprocessedContent = preprocessSuggestionsForRendering(
      withRequestPlaceholders,
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // Remove any previous injected request cards
      container
        .querySelectorAll('[data-qwery-data-analysis-request]')
        .forEach((node) => node.parentNode?.removeChild(node));

      if (!sendMessage || requests.length === 0) return;

      const placeholders = Array.from(
        container.querySelectorAll<HTMLElement>('*'),
      ).filter((el) =>
        (el.textContent ?? '').includes(
          '__QWERY_DATA_ANALYSIS_REQUEST_PLACEHOLDER__',
        ),
      );

      const injectIntoElement = (el: HTMLElement) => {
        const text = el.textContent ?? '';
        const marker = '__QWERY_DATA_ANALYSIS_REQUEST_PLACEHOLDER__';
        if (!text.includes(marker)) return;

        const parts = text.split(marker);
        if (parts.length < 2) return;

        const fragment = document.createDocumentFragment();
        fragment.appendChild(document.createTextNode(parts[0] ?? ''));

        for (let i = 1; i < parts.length; i++) {
          const rest = parts[i] ?? '';
          const idxEnd = rest.indexOf('__');
          if (idxEnd === -1) {
            fragment.appendChild(document.createTextNode(marker + rest));
            continue;
          }

          const indexStr = rest.slice(0, idxEnd);
          const tail = rest.slice(idxEnd + 2);
          const reqIndex = Number(indexStr);
          const req: DataAnalysisRequest | undefined = Number.isFinite(reqIndex)
            ? requests[reqIndex]
            : undefined;

          if (req) {
            const card = document.createElement('div');
            card.setAttribute(
              'data-qwery-data-analysis-request',
              String(reqIndex),
            );
            card.className =
              'my-3 flex w-full max-w-full flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/40';

            const title = document.createElement('div');
            title.className = 'font-medium text-amber-900 dark:text-amber-100';
            title.textContent = 'Allow analyzing sample rows?';

            const desc = document.createElement('div');
            desc.className = 'text-amber-900/80 dark:text-amber-100/80';
            desc.textContent = `This will include the first ${req.limit} rows in the LLM prompt.`;

            const actions = document.createElement('div');
            actions.className = 'flex items-center justify-end gap-2';

            const deny = document.createElement('button');
            deny.type = 'button';
            deny.className =
              'rounded-md border border-amber-300 px-3 py-1.5 text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900/30';
            deny.textContent = 'Deny';

            const allow = document.createElement('button');
            allow.type = 'button';
            allow.className =
              'rounded-md bg-amber-900 px-3 py-1.5 text-amber-50 hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-300';
            allow.textContent = 'Allow';

            const sendConsent = (approved: boolean) => {
              const payload = JSON.stringify({
                approved,
                limit: req.limit,
              });
              const text = `${DATA_ANALYSIS_CONSENT_START}${payload}${DATA_ANALYSIS_CONSENT_END}${
                approved
                  ? `OK, analyze up to ${req.limit} rows.`
                  : `No, don't analyze my raw rows.`
              }`;
              sendMessage({ text }, {});
              scrollToBottom?.();
            };

            deny.addEventListener('click', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              sendConsent(false);
            });
            allow.addEventListener('click', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              sendConsent(true);
            });

            actions.appendChild(deny);
            actions.appendChild(allow);
            card.appendChild(title);
            card.appendChild(desc);
            if (req.reason) {
              const reason = document.createElement('div');
              reason.className = 'text-amber-900/70 dark:text-amber-100/70';
              reason.textContent = `Reason: ${req.reason}`;
              card.appendChild(reason);
            }
            card.appendChild(actions);
            fragment.appendChild(card);
          } else {
            fragment.appendChild(
              document.createTextNode(`${marker}${indexStr}__`),
            );
          }

          fragment.appendChild(document.createTextNode(tail));
        }

        // Replace element content with the fragment; keep it simple (we only support plain text nodes here)
        el.textContent = '';
        el.appendChild(fragment);
      };

      placeholders.forEach(injectIntoElement);
    }, [children, requests, sendMessage, scrollToBottom]);

    return (
      <div
        ref={setContainerRef}
        className={cn('w-full max-w-full min-w-0', className)}
        style={{ maxWidth: '100%' }}
        onClick={handleContainerClick}
      >
        <MessageResponse>{preprocessedContent}</MessageResponse>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.sendMessage === nextProps.sendMessage &&
    prevProps.messages === nextProps.messages &&
    prevProps.currentMessageId === nextProps.currentMessageId &&
    prevProps.scrollToBottom === nextProps.scrollToBottom &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.isLastAgentResponse === nextProps.isLastAgentResponse &&
    prevProps.onBeforeSuggestionSend === nextProps.onBeforeSuggestionSend &&
    prevProps.onDatasourceNameClick === nextProps.onDatasourceNameClick &&
    prevProps.getDatasourceTooltip === nextProps.getDatasourceTooltip,
);

StreamdownWithSuggestions.displayName = 'StreamdownWithSuggestions';
