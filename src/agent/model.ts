/**
 * Claude models of the supervisor and the sub-agents, through LangChain's ChatAnthropic.
 *
 * Environment:
 * - ANTHROPIC_API_KEY — required; without it the chat answers that the agent is not configured.
 * - TAXERED_MODEL — model id, default `claude-haiku-5-5`.
 * - TAXERED_EFFORT — `low` | `medium` | `high` | `xhigh` | `max`, default `medium`
 *   (the current models think adaptively; effort is the depth control).
 * - TAXERED_REFUSAL_FALLBACK=0 — turns off the server-side fallback that re-runs a request the
 *   safety classifiers declined on another model (on by default where the model has one:
 *   Haiku models have none, so the parameter is never sent for them).
 */
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AgentName } from '../app/chat/protocol';

export type AgentRole = 'supervisor' | AgentName;

/** Builds the chat model of one agent; tests pass scripted models instead. */
export type ModelFactory = (role: AgentRole) => BaseChatModel;

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];

/** Tag of every model call of an agent, used to tell the supervisor's answer from sub-agents. */
export function roleTag(role: AgentRole): string {
  return `taxered:${role}`;
}

export function isAgentConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env['ANTHROPIC_API_KEY'];
}

/** Haiku has no server-side refusal fallback: a declined request would stay declined. */
function hasRefusalFallback(model: string): boolean {
  return !model.startsWith('claude-haiku');
}

export function anthropicModels(env: NodeJS.ProcessEnv = process.env): ModelFactory {
  const model = env['TAXERED_MODEL'] || 'claude-haiku-5-5';
  const effortSetting = env['TAXERED_EFFORT'] as Effort | undefined;
  const effort: Effort =
    effortSetting && EFFORTS.includes(effortSetting) ? effortSetting : 'medium';
  const fallback = env['TAXERED_REFUSAL_FALLBACK'] !== '0' && hasRefusalFallback(model);

  return (role) =>
    new ChatAnthropic({
      model,
      // Streaming leaves room for long answers without HTTP timeouts.
      streaming: true,
      maxTokens: 64000,
      outputConfig: { effort },
      ...(fallback && {
        betas: ['server-side-fallback-2026-07-01'],
        invocationKwargs: { fallbacks: 'default' },
      }),
      tags: [roleTag(role)],
    });
}
