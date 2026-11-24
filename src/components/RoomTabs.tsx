import { useState } from "react";
import { useStore } from "../store/store";
import { InlineTextEdit } from "./ui/InlineTextEdit";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { Menu } from "./ui/Menu";
import { DotsThree, Plus } from "@phosphor-icons/react";

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
    <div data-tour="rooms" className="flex h-12 shrink-0 items-center gap-1 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-3">
      <div role="tablist" aria-label="Rooms" className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 scrollbar-thin">
        {rooms.map((room, index) => {
          const active = room.id === activeRoomId;
          return (
            <div key={room.id} className={`group flex h-8 shrink-0 items-center rounded-lg border text-xs font-medium ${active ? "border-[var(--border)] bg-[var(--bg-inset)] text-[var(--text)]" : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-inset)]"}`}>
              {editingId === room.id ? <InlineTextEdit aria-label="Room tab name" value={room.name} editing onStopEditing={() => setEditingId(null)} onCommit={(name) => renameRoom(room.id, name)} className="mx-1 w-32" /> : (
                <button id={`room-tab-${room.id}`} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setActiveRoomId(room.id)} onDoubleClick={() => setEditingId(room.id)} onKeyDown={(e) => {
                  if (e.key === "F2") { e.preventDefault(); setEditingId(room.id); return; }
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const next = rooms[(index + (e.key === "ArrowRight" ? 1 : -1) + rooms.length) % rooms.length];
                  setActiveRoomId(next.id);
                  document.getElementById(`room-tab-${next.id}`)?.focus();
                }} className="h-full max-w-40 truncate rounded-lg px-3 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">{room.name}</button>
              )}
              <Menu trigger={<IconButton aria-label={`Options for ${room.name}`} icon={<DotsThree size={16} weight="bold" />} className="mr-1 h-6 w-6" />} align="left" items={[
                { key: "rename", label: "Rename", onSelect: () => setEditingId(room.id) },
                { key: "duplicate", label: "Duplicate room", onSelect: () => duplicateRoom(room.id) },
                { key: "delete", label: "Delete room", disabled: rooms.length <= 1, onSelect: () => setPendingDeleteId(room.id) },
              ]} />
            </div>
          );
        })}
      </div>
      <IconButton aria-label="Add room" icon={<Plus size={16} />} onClick={addRoom} className="shrink-0" />
      <Dialog open={pendingRoom !== undefined} onClose={() => setPendingDeleteId(null)} title={`Delete ${pendingRoom?.name ?? "room"}?`} footer={<>
        <Button size="sm" variant="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
        <Button size="sm" variant="danger" onClick={() => { if (pendingDeleteId) deleteRoom(pendingDeleteId); setPendingDeleteId(null); }}>Delete room</Button>
      </>}>
        {pendingRoom?.items.length ?? 0} furniture items
      </Dialog>
    </div>
  );
}
