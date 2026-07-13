import { useStore } from "../../store/store";
import { footprintSize } from "../../geometry/shape";
import { Copy, Eye, EyeSlash, Trash, ArrowsClockwise } from "@phosphor-icons/react";
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
    <section className="flex flex-1 flex-col gap-2 px-3.5 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        Items {room.items.length > 0 && `(${room.items.length})`}
      </h2>

      {room.items.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
          No furniture yet. Add a piece to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {room.items.map((item) => {
            const size = footprintSize(item.footprint);
            const selected = item.id === room.selectedItemId;
            return (
              <li key={item.id}>
                <div
                  onClick={() => selectItem(item.id)}
                  className={
                    "group flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-2 py-1.5 text-xs transition-[border-color,background-color] duration-150 " +
                    (selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-transparent hover:bg-[var(--bg-inset)]")
                  }
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-[3px] border border-black/10"
                    style={{ backgroundColor: item.color, opacity: item.hidden ? 0.35 : 1 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={"truncate font-medium " + (item.hidden ? "text-[var(--text-faint)]" : "text-[var(--text)]")}>
                      {item.name}
                    </div>
                    <div className="tabular-nums text-[10px] text-[var(--text-faint)]">
                      {size.w.toFixed(1)}
                      {"×"}
                      {size.d.toFixed(1)} {room.unit}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    <IconButton
                      aria-label={item.hidden ? "Show item" : "Hide item"}
                      icon={item.hidden ? <EyeSlash size={13} /> : <Eye size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleItemHidden(item.id);
                      }}
                      className="h-6 w-6"
                    />
                    <IconButton
                      aria-label="Duplicate item"
                      icon={<ArrowsClockwise size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateItem(item.id);
                      }}
                      className="h-6 w-6"
                    />
                    {otherRooms.length > 0 && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Menu
                          trigger={<IconButton aria-label="Copy to room" icon={<Copy size={13} />} className="h-6 w-6" />}
                          items={otherRooms.map((r) => ({
                            key: r.id,
                            label: `Copy to ${r.name}`,
                            onSelect: () => copyItemToRoom(item.id, r.id),
                          }))}
                        />
                      </span>
                    )}
                    <IconButton
                      aria-label="Delete item"
                      icon={<Trash size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteItem(item.id);
                      }}
                      className="h-6 w-6 hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
