import type { ProviderCallParams, ProviderResponse } from "../types";
import { callOpenAI } from "./openai";

export interface LocalStatus { available: boolean; provider: "codex"; models: string[]; reason?: string }

export function preferredLocalModel(models: string[]): string {
  return models.find((model) => /sol$/.test(model)) ?? models[0] ?? "default";
}

export async function getLocalStatus(signal?: AbortSignal): Promise<LocalStatus> {
  try {
    const response = await fetch("/api/local-ai/status", { signal, cache: "no-store" });
    if (!response.ok) throw new Error();
    const data = await response.json() as LocalStatus;
    if (typeof data.available !== "boolean" || data.provider !== "codex" || !Array.isArray(data.models) || !data.models.every((model) => typeof model === "string")) throw new Error();
    return data;
  } catch {
    signal?.throwIfAborted();
    return { available: false, provider: "codex", models: [], reason: "Start Room Planner with Kessel." };
  }
}

/** The local server supplies Kessel credentials. The browser never receives them. */
export function callLocal(params: ProviderCallParams): Promise<ProviderResponse> {
  return callOpenAI(params, { url: "/api/local-ai/chat", provider: "Local Codex", local: true });
}
