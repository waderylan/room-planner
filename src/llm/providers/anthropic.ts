import type { ProviderCallParams, ProviderResponse, Turn } from "../types";
import { LLMError } from "../types";

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function toMessages(turns: Turn[]) {
  return turns.map((turn) => {
    if (turn.role === "user") {
      return { role: "user", content: [{ type: "text", text: turn.text }] };
    }
    if (turn.role === "assistant") {
      const content: unknown[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const tc of turn.toolCalls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: "assistant", content };
    }
    // tool results go back as a user message with tool_result blocks
    return {
      role: "user",
      content: turn.results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: typeof r.output === "string" ? r.output : JSON.stringify(r.output),
        is_error: r.isError ?? false,
      })),
    };
  });
}

export async function callAnthropic({ apiKey, model, system, turns, tools }: ProviderCallParams): Promise<ProviderResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: toMessages(turns),
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LLMError(`Anthropic API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { content: AnthropicBlock[] };
  let text = "";
  const toolCalls: ProviderResponse["toolCalls"] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text" && block.text) text += block.text;
    if (block.type === "tool_use" && block.id && block.name) {
      toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} });
    }
  }
  return { text, toolCalls };
}
