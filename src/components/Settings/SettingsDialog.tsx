import { useEffect, useState } from "react";
import { Eye, EyeSlash, ArrowClockwise } from "@phosphor-icons/react";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../ui/Segmented";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import type { Provider } from "../../llm/types";
import { getLocalStatus, preferredLocalModel, type LocalStatus } from "../../llm/providers/local";
import { DEFAULT_MODELS, useSettingsStore } from "../../store/settingsStore";

interface SettingsDialogProps { open: boolean; onClose: () => void }
const PROVIDER_LABELS: Record<Provider, string> = { local: "Local Codex", anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini" };
const inputClass = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] px-3 text-sm text-[var(--text)] outline-none focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]";

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { provider, setProvider, models, setModel, apiKeys, setApiKey } = useSettingsStore();
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    if (!open || provider !== "local") return;
    const controller = new AbortController();
    setStatus(null);
    getLocalStatus(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setStatus(result);
      if (result.available && !result.models.includes(models.local)) setModel("local", preferredLocalModel(result.models));
    }).catch(() => {});
    return () => controller.abort();
  }, [open, provider, check, models.local, setModel]);
  const providers: Provider[] = import.meta.env.DEV ? ["local", "anthropic", "openai", "gemini"] : ["anthropic", "openai", "gemini"];
  return (
    <Dialog open={open} onClose={onClose} title="Assistant settings" maxWidthClassName="max-w-md" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="flex flex-col gap-5">
        <Segmented options={providers.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))} value={provider} onChange={(p) => { setProvider(p); setRevealed(false); }} />
        {provider === "local" ? <>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--bg-inset)] px-3 py-2 text-sm">
            <span role="status" className={status?.available ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>{status === null ? "Connecting…" : status.available ? "Connected to Codex" : status.reason}</span>
            <IconButton aria-label="Check local Codex connection" icon={<ArrowClockwise size={16} />} onClick={() => setCheck((v) => v + 1)} />
          </div>
          {status?.available && <label className="flex flex-col gap-2 text-xs font-medium text-[var(--text)]"><span>Model</span><select value={models.local} onChange={(e) => setModel("local", e.target.value)} className={inputClass}>{status.models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>}
        </> : <>
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--text)]">
            <span>API key <span className="font-normal text-[var(--text-muted)]">· This tab only</span></span>
            <div className="flex items-center gap-2">
              <input type={revealed ? "text" : "password"} value={apiKeys[provider]} onChange={(e) => setApiKey(provider, e.target.value)} autoComplete="off" spellCheck={false} aria-label={`${PROVIDER_LABELS[provider]} API key`} className={inputClass} />
              <IconButton aria-label={revealed ? "Hide API key" : "Show API key"} icon={revealed ? <EyeSlash size={18} /> : <Eye size={18} />} onClick={() => setRevealed(!revealed)} />
            </div>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--text)]"><span>Model</span><input type="text" value={models[provider]} onChange={(e) => setModel(provider, e.target.value)} placeholder={DEFAULT_MODELS[provider]} autoComplete="off" spellCheck={false} maxLength={200} className={inputClass} /></label>
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]"><span>Sent directly to {PROVIDER_LABELS[provider]}</span>{apiKeys[provider] && <Button variant="ghost" size="sm" onClick={() => setApiKey(provider, "")}>Clear key</Button>}</div>
        </>}
      </div>
    </Dialog>
  );
}
