import { RoomPanel } from "./RoomPanel";
import { AddFurniturePanel } from "./AddFurniturePanel";
import { StatsPanel } from "./StatsPanel";
import { Inspector } from "./Inspector";
import { ItemList } from "./ItemList";

export function Sidebar() {
  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto scrollbar-thin bg-[var(--bg-elevated)] md:w-[310px] md:shrink-0 md:border-r md:border-[var(--border)]">
      <RoomPanel />
      <StatsPanel />
      <AddFurniturePanel />
      <Inspector />
      <ItemList />
    </aside>
  );
}
