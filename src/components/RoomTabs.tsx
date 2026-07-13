import { useState } from "react";
import { useStore } from "../store/store";
import { InlineTextEdit } from "./ui/InlineTextEdit";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { Copy, Plus, Trash } from "@phosphor-icons/react";

export function RoomTabs() {
  const rooms = useStore((s) => s.doc.rooms);
  const activeRoomId = useStore((s) => s.doc.activeRoomId);
  const setActiveRoomId = useStore((s) => s.setActiveRoomId);
  const renameRoom = useStore((s) => s.renameRoom);
  const duplicateRoom = useStore((s) => s.duplicateRoom);
  const deleteRoom = useStore((s) => s.deleteRoom);
  const addRoom = useStore((s) => s.addRoom);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingRoom = rooms.find((r) => r.id === pendingDeleteId);

  return (
    <div data-tour="rooms" className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t border-[var(--border)] bg-[var(--bg-elevated)] px-2">
      {rooms.map((room) => {
        const active = room.id === activeRoomId;
        const editing = editingId === room.id;
        return (
          <div
            key={room.id}
            onClick={() => setActiveRoomId(room.id)}
            onDoubleClick={() => setEditingId(room.id)}
            className={
              "group flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-xs font-medium transition-[background-color,border-color,color] duration-150 " +
              (active
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-inset)] hover:text-[var(--text)]")
            }
          >
            {editing ? (
              <InlineTextEdit
                value={room.name}
                editing={editing}
                onStopEditing={() => setEditingId(null)}
                onCommit={(name) => renameRoom(room.id, name)}
              />
            ) : (
              <span>{room.name}</span>
            )}
            {!editing && (
              <span className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                <IconButton
                  aria-label={`Duplicate ${room.name}`}
                  icon={<Copy size={12} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateRoom(room.id);
                  }}
                  className="h-5 w-5"
                />
                {rooms.length > 1 && (
                  <IconButton
                    aria-label={`Delete ${room.name}`}
                    icon={<Trash size={12} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(room.id);
                    }}
                    className="h-5 w-5 hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  />
                )}
              </span>
            )}
          </div>
        );
      })}
      <button
        aria-label="Add room"
        onClick={addRoom}
        className="ml-1 flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-control)] border border-dashed border-[var(--border-strong)] px-3 text-xs font-medium text-[var(--text-muted)] transition-[border-color,color] duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <Plus size={13} weight="bold" />
        New room
      </button>

      <Dialog
        open={pendingRoom !== undefined}
        onClose={() => setPendingDeleteId(null)}
        title={`Delete "${pendingRoom?.name}"?`}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (pendingDeleteId) deleteRoom(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        This removes the room and all furniture in it. This cannot be undone.
      </Dialog>
    </div>
  );
}
