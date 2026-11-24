import type { JSONSchema, ProviderCallParams, ProviderResponse, Turn } from "../types";
import { LLMError } from "../types";
import { providerRequest, toolInput } from "./request";

// Gemini's raw REST Schema object (used for FunctionDeclaration.parameters)
// encodes its "type" field as the uppercase proto enum name (STRING, OBJECT,
// ...), unlike the lowercase JSON Schema convention we author tools.ts in.
function toGeminiSchema(schema: JSONSchema): unknown {
  const out: Record<string, unknown> = { type: schema.type.toUpperCase() };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.required) out.required = schema.required;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

interface GeminiPart {
  thoughtSignature?: string;
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

function toContents(turns: Turn[]) {
  return turns.map((turn) => {
    if (turn.role === "user") {
      return { role: "user", parts: [{ text: turn.text }] };
    }
    if (turn.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const tc of turn.toolCalls) parts.push({ functionCall: { name: tc.name, args: tc.input }, ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}) });
      return { role: "model", parts };
    }
    return {
      role: "user",
      parts: turn.results.map((r) => ({
        functionResponse: { name: r.name, response: { name: r.name, content: r.output } },
      })),
    };
  });
}

export async function callGemini({ apiKey, model, system, turns, tools, signal }: ProviderCallParams): Promise<ProviderResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await providerRequest<{ candidates?: { content?: { parts?: GeminiPart[] } }[] }>("Gemini", url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: toContents(turns),
      tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }],
    }),
  }, signal);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  if (!parts.length) throw new LLMError("Gemini returned no response. Try a different request.");
  let text = "";
  const toolCalls: ProviderResponse["toolCalls"] = [];
  let i = 0;
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.functionCall) {
      toolCalls.push({ id: `${part.functionCall.name}_${i++}`, name: part.functionCall.name, input: toolInput(part.functionCall.args ?? {}), thoughtSignature: part.thoughtSignature });
    }
  }
  return { text, toolCalls };
}
