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

    //console.log("Last user text:", JSON.stringify(opts.messages, null, 2));

    return await new Promise<Response>((resolve, reject) => {
      const subscription = this.factoryActor.subscribe((state) => {
        const ctx = state.context;
        console.log('Factory state in subscribe:', state.value);

        // When the state machine has produced the StreamTextResult, we can return it
        if (ctx.streamResult) {
          try {
            const response = ctx.streamResult.toUIMessageStreamResponse();
            // Optionally move the machine back to idle
            //this.factoryActor.send({ type: "STOP" });

            subscription.unsubscribe();
            resolve(response);
          } catch (err) {
            subscription.unsubscribe();
            reject(err);
          }
        }
      });

      // Kick off the state transition and LLM call
      this.factoryActor.send({
        type: 'USER_INPUT',
        messages: opts.messages,
      });
    });
  }
}
