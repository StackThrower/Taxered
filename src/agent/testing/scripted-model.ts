/**
 * Test-only: a chat model that plays back a script of replies, so the LangGraph agents can be
 * tested end to end without calling Claude. It streams (so token events are produced) and
 * records the messages of every call.
 */
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import type { AgentRole, ModelFactory } from '../model';
import { roleTag } from '../model';

export type ScriptStep = AIMessage | ((messages: BaseMessage[]) => AIMessage);

export function reply(text: string): AIMessage {
  return new AIMessage(text);
}

let callCounter = 0;

export function callTool(name: string, args: Record<string, unknown>): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [{ id: `call_${++callCounter}`, name, args, type: 'tool_call' }],
  });
}

export class ScriptedChatModel extends BaseChatModel {
  readonly steps: ScriptStep[];
  readonly calls: BaseMessage[][] = [];

  constructor(steps: ScriptStep[], tags: string[] = []) {
    super({ tags });
    this.steps = [...steps];
  }

  _llmType(): string {
    return 'scripted';
  }

  override bindTools(): this {
    return this;
  }

  private next(messages: BaseMessage[]): AIMessage {
    this.calls.push(messages);
    const step = this.steps.shift();
    if (!step) {
      throw new Error('The script has no more replies.');
    }
    return typeof step === 'function' ? step(messages) : step;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = this.next(messages);
    return { generations: [{ text: String(message.content), message }] };
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const message = this.next(messages);
    const text = String(message.content);
    // Text in two pieces, to exercise token streaming.
    const pieces = text
      ? [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))]
      : [];
    for (const piece of pieces.filter(Boolean)) {
      const chunk = new ChatGenerationChunk({ text: piece, message: new AIMessageChunk(piece) });
      yield chunk;
      await runManager?.handleLLMNewToken(piece, undefined, undefined, undefined, undefined, {
        chunk,
      });
    }
    if (message.tool_calls?.length) {
      yield new ChatGenerationChunk({
        text: '',
        message: new AIMessageChunk({
          content: '',
          tool_call_chunks: message.tool_calls.map((call, index) => ({
            type: 'tool_call_chunk' as const,
            id: call.id,
            name: call.name,
            args: JSON.stringify(call.args),
            index,
          })),
        }),
      });
    }
  }
}

/** One scripted model per agent role; roles without a script fail when called. */
export function scriptedModels(scripts: Partial<Record<AgentRole, ScriptStep[]>>): {
  models: ModelFactory;
  instances: Map<AgentRole, ScriptedChatModel>;
} {
  const instances = new Map<AgentRole, ScriptedChatModel>();
  const models: ModelFactory = (role) => {
    const model = new ScriptedChatModel(scripts[role] ?? [], [roleTag(role)]);
    instances.set(role, model);
    return model;
  };
  return { models, instances };
}

/** NBU API stand-in: answers every request with the rate `rates[currency]`. */
export function nbuFetch(rates: Record<string, number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    if (url.host === 'bank.gov.ua') {
      const currency = url.searchParams.get('valcode') ?? '';
      const rate = rates[currency];
      return new Response(JSON.stringify(rate ? [{ rate, cc: currency }] : []), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.host === 'api.coingecko.com') {
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected request in a test: ${url}`);
  }) as typeof fetch;
}
