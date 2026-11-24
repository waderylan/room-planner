import { useEffect, useRef, useState } from "react";
import { PaperPlaneRight, Sparkle, Square, Trash, Wrench, X } from "@phosphor-icons/react";
import { runAgent } from "../../llm/agent";
import { DEFAULT_MODELS, useSettingsStore } from "../../store/settingsStore";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { useStore } from "../../store/store";
import { getLocalStatus, preferredLocalModel, type LocalStatus } from "../../llm/providers/local";
import { readChatSession, saveChatSession, stoppedChatSession, type ChatEntry, type ChatSession as Session } from "./sessions";

interface ChatPanelProps { onClose: () => void; onOpenSettings: () => void }
interface PendingRequest { controller: AbortController; text: string }

const TOOL_VERBS: Record<string, string> = {
  get_room_state: "Reading the room", list_presets: "Checking furniture", set_room_shape: "Resizing the room",
  set_room_unit: "Converting units", set_ceiling: "Setting ceiling height", add_alcove: "Adding an alcove",
  remove_alcove: "Removing an alcove", add_opening: "Adding an opening", remove_opening: "Removing an opening",
  describe_walls: "Reading wall dimensions", add_item: "Adding furniture", place_item: "Placing furniture",
  move_item: "Moving furniture", check_room: "Checking the layout", clear_items: "Removing furniture",
  update_item: "Updating furniture", remove_item: "Removing furniture",
};

export function ChatPanel(props: ChatPanelProps) {
  const projectId = useStore((s) => s.activeProjectId);
  const roomId = useStore((s) => s.doc.activeRoomId);
  const scope = JSON.stringify([projectId, roomId]);
  return <ChatSession key={scope} scope={scope} {...props} />;
}

function ChatSession({ scope, onClose, onOpenSettings }: ChatPanelProps & { scope: string }) {
  const provider = useSettingsStore((s) => s.provider);
  const models = useSettingsStore((s) => s.models);
  const model = models[provider];
  const apiKey = useSettingsStore((s) => s.apiKeys[provider]);
  const [session, setSession] = useState(() => readChatSession(scope));
  const sessionRef = useRef(session);
  const [loading, setLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalStatus | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<PendingRequest | null>(null);
  const previousConfiguration = useRef({ provider, model, apiKey });

  function updateSession(update: (current: Session) => Session) {
    const next = update(sessionRef.current);
    sessionRef.current = next;
    saveChatSession(scope, next);
    setSession(next);
  }

  function pushEntry(kind: ChatEntry["kind"], text: string) {
    updateSession((current) => ({ ...current, entries: [...current.entries, { id: crypto.randomUUID(), kind, text }] }));
  }

  function stop() {
    const pending = requestRef.current;
    if (!pending) return;
    pending.controller.abort();
    requestRef.current = null;
    setLoading(false);
    updateSession((current) => stoppedChatSession(current, pending.text));
  }

  useEffect(() => () => {
    const pending = requestRef.current;
    if (!pending) return;
    pending.controller.abort();
    requestRef.current = null;
    // Unmount can come from the backdrop or room navigation as well as the close button.
    saveChatSession(scope, stoppedChatSession(sessionRef.current, pending.text));
  }, [scope]);

  useEffect(() => {
    const previous = previousConfiguration.current;
    previousConfiguration.current = { provider, model, apiKey };
    if (previous.provider !== provider || previous.model !== model || previous.apiKey !== apiKey) stop();
    // A settings commit cancels execution without discarding the transcript or draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, model, apiKey]);

  useEffect(() => {
    if (provider !== "local") return;
    const controller = new AbortController();
    setLocalStatus(null);
    getLocalStatus(controller.signal).then((status) => { if (!controller.signal.aborted) setLocalStatus(status); }).catch(() => {});
    return () => controller.abort();
  }, [provider, models]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [session.entries, loading]);

  const checking = provider === "local" && localStatus === null;
  const ready = provider === "local" ? localStatus?.available === true : Boolean(apiKey.trim());

  async function send() {
    const text = sessionRef.current.draft.trim();
    if (!text || requestRef.current) return;
    if (!ready) { onOpenSettings(); return; }
    const controller = new AbortController();
    requestRef.current = { controller, text };
    setLoading(true);
    try {
      let selectedModel = model.trim() || DEFAULT_MODELS[provider];
      if (provider === "local") {
        const status = await getLocalStatus(controller.signal);
        if (controller.signal.aborted) return;
        setLocalStatus(status);
        if (!status.available) { onOpenSettings(); return; }
        if (!status.models.includes(selectedModel)) selectedModel = preferredLocalModel(status.models);
      }
      const context = JSON.stringify([provider, selectedModel]);
      const history = sessionRef.current.historyContext === context ? sessionRef.current.turns : [];
      updateSession((current) => ({ ...current, draft: "", entries: [...current.entries, { id: crypto.randomUUID(), kind: "user", text }] }));
      const turns = await runAgent({
        provider, apiKey: apiKey.trim(), model: selectedModel, history, userMessage: text, signal: controller.signal,
        onEvent(event) {
          if (controller.signal.aborted || requestRef.current?.controller !== controller) return;
          if (event.type === "tool_call" && event.name) pushEntry("activity", TOOL_VERBS[event.name] ?? "Updating the room");
          else if (event.type === "tool_result" && event.isError) pushEntry("error", String(event.output));
          else if (event.type === "text" && event.text) pushEntry("assistant", event.text);
        },
      });
      if (!controller.signal.aborted && requestRef.current?.controller === controller) updateSession((current) => ({ ...current, turns, historyContext: context }));
    } catch (error) {
      if (!controller.signal.aborted && requestRef.current?.controller === controller) {
        updateSession((current) => ({ ...current, turns: [], historyContext: null, draft: current.draft || text }));
        pushEntry("error", error instanceof Error ? error.message : "The assistant could not complete the request.");
        inputRef.current?.focus();
      }
    } finally {
      if (requestRef.current?.controller === controller) { requestRef.current = null; setLoading(false); }
    }
  }

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--bg-elevated)] md:w-[340px] md:shrink-0 md:border-l md:border-[var(--border)]">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3.5">
        <Sparkle size={16} className="text-[var(--accent)]" /><h2 className="text-sm font-semibold text-[var(--text)]">Assistant</h2>
        <div className="ml-auto flex items-center gap-1">
          <IconButton aria-label="Clear conversation" icon={<Trash size={15} />} onClick={() => updateSession((current) => ({ ...current, entries: [], turns: [], historyContext: null }))} disabled={loading || session.entries.length === 0} />
          <IconButton aria-label="Assistant settings" icon={<Wrench size={15} />} onClick={onOpenSettings} />
          <IconButton aria-label="Close assistant" icon={<X size={16} />} onClick={() => { stop(); onClose(); }} />
        </div>
      </div>
      <div ref={listRef} role="log" aria-label="Assistant conversation" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto scrollbar-thin px-3.5 py-3">
        {session.entries.length === 0 && !session.draft && ready && <div className="mt-auto flex flex-col items-start gap-2 pb-3">{["Furnish this room", "Add a desk", "Check the layout"].map((prompt) => <Button key={prompt} size="sm" onClick={() => { updateSession((current) => ({ ...current, draft: prompt })); void send(); }}>{prompt}</Button>)}</div>}
        {session.entries.map((entry) => <ChatBubble key={entry.id} entry={entry} />)}
        {loading && <div role="status" className="px-1 text-xs text-[var(--text-faint)]">Working…</div>}
      </div>
      {!ready && !loading && <div className="flex flex-col items-start gap-2 px-3.5 pb-3">{provider === "local" && localStatus?.reason && <span role="status" className="text-xs text-[var(--text-muted)]">{localStatus.reason}</span>}<Button variant="primary" size="sm" onClick={onOpenSettings} disabled={checking}>{checking ? "Connecting…" : "Set up assistant"}</Button></div>}
      <div className="flex shrink-0 items-end gap-2 border-t border-[var(--border)] p-3">
        <textarea ref={inputRef} value={session.draft} onChange={(event) => updateSession((current) => ({ ...current, draft: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!checking) void send(); } }} placeholder="Plan your room…" aria-label="Message the assistant" maxLength={8000} rows={2} className="min-h-[2.25rem] flex-1 resize-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] px-2.5 py-2 text-sm text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]" />
        {loading ? <Button icon={<Square size={14} />} onClick={stop}>Stop</Button> : <Button variant="primary" icon={<PaperPlaneRight size={14} />} onClick={() => void send()} disabled={!ready || !session.draft.trim()}>Send</Button>}
      </div>
    </aside>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  if (entry.kind === "activity") return <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--text-faint)]"><Wrench size={11} /><span>{entry.text}</span></div>;
  if (entry.kind === "error") return <div className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-2.5 py-1.5 text-xs text-[var(--danger)]">{entry.text}</div>;
  const user = entry.kind === "user";
  return <div className={"flex " + (user ? "justify-end" : "justify-start")}><div className={"max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3 py-2 text-sm " + (user ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "border border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text)]")}>{entry.text}</div></div>;
}
