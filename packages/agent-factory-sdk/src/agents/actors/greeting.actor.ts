import { streamText } from 'ai';
import { fromPromise } from 'xstate/actors';
import { GREETING_PROMPT } from '../prompts/greeting.prompt';
import { resolveModel } from '../../services';

export const greeting = async (text: string, model: string) =>
  streamText({
    model: await resolveModel(model),
    prompt: GREETING_PROMPT(text),
  });

export const greetingActor = fromPromise(
  async ({
    input,
  }: {
    input: {
      inputMessage: string;
      model: string;
    };
  }) => greeting(input.inputMessage, input.model),
);
