import { useStore } from "../../store/store";
import { footprintSize } from "../../geometry/shape";
import { formatLengthCompact } from "../../format/length";
import { Eye, EyeSlash, DotsThree } from "@phosphor-icons/react";
import { Menu } from "../ui/Menu";
import { IconButton } from "../ui/IconButton";

export function ItemList() {
  const doc = useStore((s) => s.doc);
  const room = useStore((s) => s.activeRoom());
  const selectItem = useStore((s) => s.selectItem);
  const toggleItemHidden = useStore((s) => s.toggleItemHidden);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const copyItemToRoom = useStore((s) => s.copyItemToRoom);
  const otherRooms = doc.rooms.filter((r) => r.id !== room.id);

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]"><h2>In this room</h2><span className="tabular-nums">{room.items.length}</span></div>
      {room.items.length === 0 ? <p className="py-3 text-xs text-[var(--text-faint)]">No furniture</p> : (
        <ul className="flex flex-col gap-1">
          {room.items.map((item) => {
            const size = footprintSize(item.footprint);
            const selected = item.id === room.selectedItemId;
            return (
              <li key={item.id} className={`group flex items-center gap-1 rounded-[var(--radius-control)] border p-1 text-xs transition-colors ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--bg-inset)]"}`}>
                <button aria-pressed={selected} aria-label={`Select ${item.name}`} onClick={() => selectItem(item.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                  <span className="h-5 w-5 shrink-0 rounded border border-black/10" style={{ backgroundColor: item.color, opacity: item.hidden ? .3 : .7 }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${item.hidden ? "text-[var(--text-faint)] line-through" : "text-[var(--text)]"}`}>{item.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] tabular-nums text-[var(--text-muted)]">{formatLengthCompact(size.w, room.unit)} × {formatLengthCompact(size.d, room.unit)}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <IconButton aria-label={`${item.hidden ? "Show" : "Hide"} ${item.name}`} icon={item.hidden ? <EyeSlash size={13} /> : <Eye size={13} />} onClick={() => toggleItemHidden(item.id)} className="h-7 w-7" />
                  <Menu trigger={<IconButton aria-label={`Options for ${item.name}`} icon={<DotsThree size={16} weight="bold" />} className="h-7 w-7" />} items={[
                    { key: "duplicate", label: "Duplicate", onSelect: () => duplicateItem(item.id) },
                    ...otherRooms.map((r) => ({ key: r.id, label: `Copy to ${r.name}`, onSelect: () => copyItemToRoom(item.id, r.id) })),
                    { key: "delete", label: "Delete", onSelect: () => deleteItem(item.id) },
                  ]} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
