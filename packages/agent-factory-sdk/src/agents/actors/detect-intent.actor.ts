import { generateObject } from 'ai';
import { z } from 'zod';
import { fromPromise } from 'xstate/actors';
import { IntentSchema } from '../types';
import { createAzure } from '@ai-sdk/azure';
import { DETECT_INTENT_PROMPT } from '../prompts/detect-intent.prompt';

export const detectIntent = async (text: string) => {
  const azure = createAzure({
    apiKey: process.env.AZURE_API_KEY,
    resourceName: process.env.AZURE_RESOURCE_NAME,
  });

  const result = await generateObject({
    model: azure('gpt-5-mini'),
    schema: IntentSchema,
    prompt: DETECT_INTENT_PROMPT(text),
  });

  return result.object;
};

export const detectIntentActor = fromPromise(
  async ({
    input,
  }: {
    input: {
      inputMessage: string;
    };
  }): Promise<z.infer<typeof IntentSchema>> => {
    console.log('input', input);
    const intent = await detectIntent(input.inputMessage);

    console.log('intent', intent);
    return intent;
  },
);
