import { UIMessage } from 'ai';
import { createActor } from 'xstate';
import { nanoid } from 'nanoid';
import { createStateMachine } from './state-machine';

export interface FactoryAgentOptions {
  conversationId: string;
}

export class FactoryAgent {
  readonly id: string;
  private readonly conversationId: string;
  private lifecycle: ReturnType<typeof createStateMachine>;
  private factoryActor: ReturnType<typeof createActor>;

  constructor(opts: FactoryAgentOptions) {
    this.id = nanoid();
    this.conversationId = opts.conversationId;

    this.lifecycle = createStateMachine(this.conversationId);

    this.factoryActor = createActor(
      this.lifecycle as ReturnType<typeof createStateMachine>,
    );

    this.factoryActor.subscribe((state) => {
      console.log('###Factory state:', state.value);
    });

    this.factoryActor.start();
  }

  /**
   * Called from your API route / server action.
   * It wires the UI messages into the machine, waits for the LLM stream
   * to be produced by the `generateLLMResponse` action, and returns
   * a streaming Response compatible with the AI SDK UI.
   */
  async respond(opts: { messages: UIMessage[] }): Promise<Response> {
    console.log(
      `Message received, factory state [${this.id}]:`,
      this.factoryActor.getSnapshot().value,
    );

    // Get the current input message to track which request this is for
    const lastMessage = opts.messages[opts.messages.length - 1];
    const textPart = lastMessage?.parts.find((p) => p.type === 'text');
    const currentInputMessage =
      textPart && 'text' in textPart ? (textPart.text as string) : '';

    //console.log("Last user text:", JSON.stringify(opts.messages, null, 2));

    return await new Promise<Response>((resolve, reject) => {
      let requestStarted = false;

      const subscription = this.factoryActor.subscribe((state) => {
        const ctx = state.context;
        console.log('Factory state in subscribe:', state.value);

        // Mark that we've started processing (state is running or we have a result)
        if (state.value === 'running' || ctx.streamResult) {
          requestStarted = true;
        }

        // When the state machine has produced the StreamTextResult, verify it's for the current request
        if (ctx.streamResult && requestStarted) {
          // Verify this result is for the current request by checking inputMessage matches
          const resultInputMessage = ctx.inputMessage;
          if (resultInputMessage === currentInputMessage) {
            try {
              const response = ctx.streamResult.toUIMessageStreamResponse();
              subscription.unsubscribe();
              resolve(response);
            } catch (err) {
              subscription.unsubscribe();
              reject(err);
            }
          }
          // If inputMessage doesn't match, it's a stale result - wait for the correct one
        }
      });

      // Kick off the state transition and LLM call
      // The state machine will clear any previous streamResult when USER_INPUT is received
      this.factoryActor.send({
        type: 'USER_INPUT',
        messages: opts.messages,
      });
    });
  }
}
