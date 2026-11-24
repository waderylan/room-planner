import type { ProviderCallParams, ProviderResponse, Turn } from "../types";
import { LLMError } from "../types";
import { providerRequest, toolInput } from "./request";

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

function toMessages(system: string, turns: Turn[]) {
  const messages: unknown[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        tool_calls: turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      });
    } else {
      for (const r of turn.results) {
        messages.push({
          role: "tool",
          tool_call_id: r.id,
          content: typeof r.output === "string" ? r.output : JSON.stringify(r.output),
        });
      }
    }
  }
  return messages;
}

export async function callOpenAI({ apiKey, model, system, turns, tools, signal }: ProviderCallParams, endpoint = { url: "https://api.openai.com/v1/chat/completions", provider: "OpenAI", local: false }): Promise<ProviderResponse> {
  const data = await providerRequest<{ choices: { message: OpenAIMessage }[] }>(endpoint.provider, endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(endpoint.local ? { "x-room-planner-client": "1" } : { authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({
      model,
      messages: toMessages(system, turns),
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  }, signal, endpoint.local ? 180_000 : 60_000);
  const message = data.choices?.[0]?.message;
  if (!message) throw new LLMError("OpenAI response had no choices");

  const toolCalls: ProviderResponse["toolCalls"] = (message.tool_calls ?? []).map((tc) => {
    let input: Record<string, unknown> = {};
    try {
      input = toolInput(JSON.parse(tc.function.arguments || "{}"));
    } catch {
      throw new LLMError(`${endpoint.provider} returned invalid tool arguments. Try again.`);
    }
    return { id: tc.id, name: tc.function.name, input };
  });

  return { text: message.content ?? "", toolCalls };
}
