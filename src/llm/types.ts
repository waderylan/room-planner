export type Provider = "anthropic" | "openai" | "gemini";

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  enum?: (string | number)[];
  required?: string[];
  description?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  output: unknown;
  isError?: boolean;
}

export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

export interface ProviderResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface ProviderCallParams {
  apiKey: string;
  model: string;
  system: string;
  turns: Turn[];
  tools: ToolDef[];
}

export class LLMError extends Error {}
