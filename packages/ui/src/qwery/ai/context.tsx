'use client';

import { LanguageModelUsage } from 'ai';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from '../../ai-elements/context';

export type QweryContextProps = {
  usedTokens: number;
  maxTokens: number;
  usage?: LanguageModelUsage;
  modelId?: string;
};
export default function QweryContext(props: QweryContextProps) {
  const percentage = (props.usedTokens / props.maxTokens) * 100;
  const colorClass =
    percentage >= 90
      ? 'text-red-500'
      : percentage >= 80
        ? 'text-orange-500'
        : '';

  return (
    <Context
      maxTokens={props.maxTokens}
      modelId={props.modelId}
      usage={props.usage}
      usedTokens={props.usedTokens}
    >
      <ContextTrigger className={colorClass} />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextReasoningUsage />
          <ContextCacheUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  );
}
