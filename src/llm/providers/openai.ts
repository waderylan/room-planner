import type { ProviderCallParams, ProviderResponse, Turn } from "../types";
import { LLMError } from "../types";

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

export async function callOpenAI({ apiKey, model, system, turns, tools }: ProviderCallParams): Promise<ProviderResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: toMessages(system, turns),
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LLMError(`OpenAI API error (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { choices: { message: OpenAIMessage }[] };
  const message = data.choices?.[0]?.message;
  if (!message) throw new LLMError("OpenAI response had no choices");

  const toolCalls: ProviderResponse["toolCalls"] = (message.tool_calls ?? []).map((tc) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function.arguments || "{}");
    } catch {
      /* leave empty */
    }
    return { id: tc.id, name: tc.function.name, input };
  });

  return { text: message.content ?? "", toolCalls };
}
