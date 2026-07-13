import { useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { PaperPlaneRight, Sparkle, Trash, Wrench, X } from "@phosphor-icons/react";
import type { Turn } from "../../llm/types";
import { runAgent } from "../../llm/agent";
import { DEFAULT_MODELS, useSettingsStore } from "../../store/settingsStore";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";

interface ChatEntry {
  id: string;
  kind: "user" | "assistant" | "activity" | "error";
  text: string;
}

const TOOL_VERBS: Record<string, (input: Record<string, unknown>) => string> = {
  get_room_state: () => "Reading the room",
  list_presets: () => "Checking furniture presets",
  set_room_shape: (i) => `Setting room shape (${i.kind}, ${i.width}x${i.length})`,
  set_room_unit: (i) => `Switching units to ${i.unit}`,
  set_ceiling: (i) => `Setting ceiling height to ${i.height}`,
  add_alcove: (i) => `Adding an alcove on the ${i.wall} wall`,
  remove_alcove: () => "Removing an alcove",
  add_opening: (i) => `Adding a ${i.kind} on wall ${i.wallIndex}`,
  remove_opening: () => "Removing an opening",
  describe_walls: () => "Looking at the walls",
  add_item: (i) => `Adding ${i.presetId ?? "an item"}`,
  place_item: (i) => `Placing ${i.presetId ?? "an item"}${placementSuffix(i)}`,
  move_item: (i) => `Moving an item${placementSuffix(i)}`,
  check_room: () => "Checking for overlaps",
  clear_items: () => "Clearing the furniture",
  update_item: () => "Updating an item",
  remove_item: () => "Removing an item",
};

function placementSuffix(i: Record<string, unknown>): string {
  switch (i.placement) {
    case "wall":
      return ` against the ${i.wall} wall`;
    case "corner":
      return ` in the ${i.corner} corner`;
    case "center":
      return " in the center";
    case "beside":
      return ` beside another item`;
    default:
      return "";
  }
}

function describeToolCall(name: string, input: Record<string, unknown>): string {
  return TOOL_VERBS[name]?.(input) ?? `Calling ${name}`;
}

interface ChatPanelProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

export function ChatPanel({ onClose, onOpenSettings }: ChatPanelProps) {
  const provider = useSettingsStore((s) => s.provider);
  const model = useSettingsStore((s) => s.models[provider]);
  const apiKey = useSettingsStore((s) => s.apiKeys[provider]);

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function clearChat() {
    if (loading) return;
    setEntries([]);
    setTurns([]);
    setInput("");
  }

  function pushEntry(kind: ChatEntry["kind"], text: string) {
    setEntries((prev) => [...prev, { id: uuid(), kind, text }]);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    pushEntry("user", text);

    if (!apiKey) {
      pushEntry("error", `No API key set for ${provider}. Open Settings to add one.`);
      return;
    }

    setLoading(true);
    try {
      const nextTurns = await runAgent({
        provider,
        apiKey,
        model: model || DEFAULT_MODELS[provider],
        history: turns,
        userMessage: text,
        onEvent: (event) => {
          if (event.type === "tool_call" && event.name) {
            pushEntry("activity", describeToolCall(event.name, (event.input as Record<string, unknown>) ?? {}));
          } else if (event.type === "tool_result" && event.isError) {
            pushEntry("error", `${event.name}: ${String(event.output)}`);
          } else if (event.type === "text" && event.text) {
            pushEntry("assistant", event.text);
          }
        },
      });
      setTurns(nextTurns);
    } catch (e) {
      pushEntry("error", e instanceof Error ? e.message : "Something went wrong talking to the model.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--bg-elevated)] md:w-[340px] md:shrink-0 md:border-l md:border-[var(--border)]">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3.5">
        <Sparkle size={16} className="text-[var(--accent)]" />
        <h2 className="text-sm font-semibold text-[var(--text)]">Assistant</h2>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            aria-label="Clear chat"
            icon={<Trash size={15} />}
            onClick={clearChat}
            disabled={loading || entries.length === 0}
          />
          <IconButton aria-label="Assistant settings" icon={<Wrench size={15} />} onClick={onOpenSettings} />
          <IconButton aria-label="Close assistant" icon={<X size={16} />} onClick={onClose} />
        </div>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto scrollbar-thin px-3.5 py-3">
        {entries.length === 0 && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--text-faint)]">
            Describe a room in plain language, e.g. "Make this a 14x11 bedroom with a queen bed against the north
            wall and a desk in the corner."
          </div>
        )}
        {entries.map((entry) => (
          <ChatBubble key={entry.id} entry={entry} />
        ))}
        {loading && <div className="px-1 text-xs text-[var(--text-faint)]">Working...</div>}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-[var(--border)] p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the assistant to place furniture..."
          rows={2}
          className="min-h-[2.25rem] flex-1 resize-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] px-2.5 py-2 text-sm text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
        />
        <Button size="md" variant="primary" icon={<PaperPlaneRight size={14} />} onClick={send} disabled={loading || !input.trim()}>
          Send
        </Button>
      </div>
    </aside>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  if (entry.kind === "activity") {
    return (
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--text-faint)]">
        <Wrench size={11} />
        <span>{entry.text}</span>
      </div>
    );
  }
  if (entry.kind === "error") {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-2.5 py-1.5 text-xs text-[var(--danger)]">
        {entry.text}
      </div>
    );
  }
  const isUser = entry.kind === "user";
  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3 py-2 text-sm " +
          (isUser
            ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
            : "border border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text)]")
        }
      >
        {entry.text}
      </div>
    </div>
  );
}
