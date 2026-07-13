import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../ui/Segmented";
import type { Provider } from "../../llm/types";
import { DEFAULT_MODELS, useSettingsStore } from "../../store/settingsStore";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
};

const KEY_PLACEHOLDERS: Record<Provider, string> = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
  gemini: "AIza...",
};

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const provider = useSettingsStore((s) => s.provider);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const models = useSettingsStore((s) => s.models);
  const setModel = useSettingsStore((s) => s.setModel);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKey = useSettingsStore((s) => s.setApiKey);

  const [revealed, setRevealed] = useState<Provider | null>(null);

  return (
    <Dialog open={open} onClose={onClose} title="AI assistant settings" maxWidthClassName="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--text-muted)]">
          Keys are stored only in this browser (localStorage) and sent directly to the chosen provider when you use
          the chat panel. They are never sent anywhere else.
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">Active provider</span>
          <Segmented
            options={(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))}
            value={provider}
            onChange={setProvider}
          />
        </div>

        <div className="flex flex-col gap-3">
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
            <div
              key={p}
              className={
                "flex flex-col gap-2 rounded-[var(--radius-control)] border p-2.5 " +
                (p === provider ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg-inset)]")
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text)]">{PROVIDER_LABELS[p]}</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">API key</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type={revealed === p ? "text" : "password"}
                    value={apiKeys[p]}
                    onChange={(e) => setApiKey(p, e.target.value)}
                    placeholder={KEY_PLACEHOLDERS[p]}
                    className="h-8 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 text-xs text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed(revealed === p ? null : p)}
                    className="h-8 shrink-0 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-[10px] text-[var(--text-muted)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    {revealed === p ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Model</span>
                <input
                  type="text"
                  value={models[p]}
                  onChange={(e) => setModel(p, e.target.value)}
                  placeholder={DEFAULT_MODELS[p]}
                  className="tabular-nums h-8 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 text-xs text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
                />
              </label>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
