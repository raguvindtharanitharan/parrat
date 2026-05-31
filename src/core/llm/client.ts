import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageParam, Tool } from '@anthropic-ai/sdk/resources';
import { LlmApiError } from '../errors.js';

/**
 * Per-call options for the LLM client. Mirrors the Anthropic SDK's
 * messages.create shape but exposes only what playbook-executor needs to drive.
 */
export interface LlmCallOptions {
  model: string;
  maxTokens: number;
  temperature: number;
  system: string;
  messages: MessageParam[];
  tools: Tool[];
}

export interface LlmClient {
  call(options: LlmCallOptions): Promise<Message>;
}

export interface CreateLlmClientOptions {
  apiKey: string;
  /** Maximum retries on transient failures. Defaults to 3 (1s, 2s, 4s). */
  maxRetries?: number;
}

/**
 * Build an LLM client around the Anthropic SDK. The retry wrapper handles
 * transient failures (5xx, network timeouts, rate-limit) with exponential
 * backoff. 4xx errors are NOT retried — they're misuse, not flake.
 */
export function createLlmClient(options: CreateLlmClientOptions): LlmClient {
  const sdk = new Anthropic({ apiKey: options.apiKey });
  const maxRetries = options.maxRetries ?? 3;

  return {
    call: async (callOptions) => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await sdk.messages.create({
            model: callOptions.model,
            max_tokens: callOptions.maxTokens,
            temperature: callOptions.temperature,
            system: callOptions.system,
            messages: callOptions.messages,
            tools: callOptions.tools,
          });
        } catch (error) {
          lastError = error;
          if (!isTransient(error) || attempt === maxRetries) break;
          await sleep(2 ** attempt * 1000);
        }
      }
      throw new LlmApiError(
        `Anthropic API call failed after ${maxRetries + 1} attempts`,
        lastError,
      );
    },
  };
}

function isTransient(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError)) return false;
  // 5xx, 408 (timeout), 429 (rate limit) are transient. 4xx other than 408/429 are not.
  const status = error.status ?? 0;
  return status >= 500 || status === 408 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
