import { useEffect, useState } from "react";
import { Armchair, Ruler, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useStore } from "../../store/store";
import { RoomPanel } from "./RoomPanel";
import { AddFurniturePanel } from "./AddFurniturePanel";
import { StatsPanel } from "./StatsPanel";
import { Inspector } from "./Inspector";
import { ItemList } from "./ItemList";
import { IconButton } from "../ui/IconButton";

type Tab = "furniture" | "room" | "selection";

export function Sidebar() {
  const selectedId = useStore((s) => s.activeRoom().selectedItemId);
  const closeSidebar = useStore((s) => s.setSidebarOpen);
  const [tab, setTab] = useState<Tab>("furniture");

  useEffect(() => {
    if (selectedId) setTab("selection");
    else setTab((current) => current === "selection" ? "furniture" : current);
  }, [selectedId]);

  const tabs = [
    { id: "furniture" as const, name: "Furniture", icon: Armchair },
    { id: "room" as const, name: "Room", icon: Ruler },
    { id: "selection" as const, name: "Selection", icon: SlidersHorizontal },
  ];

  return (
    <aside aria-label="Design tools" className="flex h-full w-full flex-col bg-[var(--bg-elevated)] md:w-[300px] md:shrink-0 md:border-r md:border-[var(--border)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
        <span className="text-sm font-semibold tracking-tight">Design tools</span>
        <IconButton aria-label="Close design tools" icon={<X size={17} />} onClick={() => closeSidebar(false)} className="md:hidden" />
      </div>
      <div role="tablist" aria-label="Design tools" className="grid shrink-0 grid-cols-3 border-b border-[var(--border)] px-3">
        {tabs.map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`tools-${id}`}
            aria-selected={tab === id}
            aria-controls="design-tools-panel"
            tabIndex={tab === id ? 0 : -1}
            disabled={id === "selection" && !selectedId}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const available = tabs.filter((entry) => entry.id !== "selection" || selectedId);
              const current = available.findIndex((entry) => entry.id === id);
              const next = available[(current + (e.key === "ArrowRight" ? 1 : -1) + available.length) % available.length];
              setTab(next.id);
              document.getElementById(`tools-${next.id}`)?.focus();
            }}
            className={`flex h-12 items-center justify-center gap-1.5 border-b-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-35 ${tab === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"}`}
          >
            <Icon size={15} />{name}
          </button>
        ))}
      </div>
      <div id="design-tools-panel" role="tabpanel" aria-labelledby={`tools-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
        {tab === "furniture" && <><AddFurniturePanel /><ItemList /></>}
        {tab === "room" && <><RoomPanel /><StatsPanel /></>}
        {tab === "selection" && <><Inspector /><ItemList /></>}
      </div>
    </aside>
  );
}
