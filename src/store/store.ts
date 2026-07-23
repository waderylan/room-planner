import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Alcove, Doc, Item, MeasureMode, Opening, Room, RoomShape } from "../model/types";
import { cloneItem, createDoc, createRoom, itemFromPreset } from "../model/factory";
import { findFreeSpot } from "../model/freeSpot";
import type { FurniturePreset } from "../model/presets";
import { safeParseDoc } from "../model/migrate";
import { buildOutline } from "../geometry/roomOutline";
import { clampPolygonInside } from "../geometry/shape";
import { clampOpening } from "../geometry/openings";
import { snap } from "../geometry/polygon";
import { loadPersistedDoc, persistDocDebounced } from "./persistence";
import type { Toast, ToastVariant } from "./toast";

export type ViewMode = "2d" | "3d";
export type CameraMode = "orbit" | "walk";
export type Theme = "light" | "dark";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem("room-planner:theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return prefersDark() ? "dark" : "light";
}

interface StoreState {
  doc: Doc;
  theme: Theme;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  snapEnabled: boolean;
  snapStep: number;
  sidebarOpen: boolean;
  wallsVisible: boolean;
  chatOpen: boolean;
  tourOpen: boolean;
  toasts: Toast[];

  // derived helpers
  activeRoom: () => Room;

  // doc-level
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setViewMode: (m: ViewMode) => void;
  setCameraMode: (m: CameraMode) => void;
  toggleSnap: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleWallsVisible: () => void;
  setChatOpen: (open: boolean) => void;
  setTourOpen: (open: boolean) => void;

  // rooms
  addRoom: () => void;
  renameRoom: (id: string, name: string) => void;
  duplicateRoom: (id: string) => void;
  deleteRoom: (id: string) => void;
  setActiveRoomId: (id: string) => void;
  setRoomUnit: (unit: Room["unit"]) => void;
  setRoomShape: (shape: RoomShape) => void;
  setRoomCeiling: (ceiling: number) => void;
  addAlcove: (alcove: Omit<Alcove, "id">) => void;
  removeAlcove: (id: string) => void;
  setMeasureMode: (mode: MeasureMode) => void;

  // wall openings (windows / doors)
  addOpening: (opening: Opening) => void;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  removeOpening: (id: string) => void;

  // items
  addItemFromPreset: (preset: FurniturePreset) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
  moveItem: (id: string, pos: Item["pos"], opts?: { skipSnap?: boolean; skipClamp?: boolean }) => void;
  rotateItem: (id: string, rotDeg: number) => void;
  resizeItem: (id: string, footprint: Item["footprint"], pos: Item["pos"], opts?: { skipClamp?: boolean }) => void;
  deleteItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  copyItemToRoom: (itemId: string, targetRoomId: string) => void;
  toggleItemHidden: (id: string) => void;
  selectItem: (id: string | null) => void;

  // persistence
  exportDoc: () => void;
  importDoc: (json: string) => void;
  resetDoc: () => void;

  // toasts
  pushToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
}

function withOutline(shape: RoomShape, alcoves: Alcove[]) {
  return buildOutline(shape, alcoves);
}

function clampRoomShape(shape: RoomShape): RoomShape {
  if (shape.kind !== "lshape") return shape;
  const nw = Math.min(shape.notchWidth ?? 0, shape.width - 0.5);
  const nd = Math.min(shape.notchDepth ?? 0, shape.length - 0.5);
  return { ...shape, notchWidth: Math.max(0.5, nw), notchDepth: Math.max(0.5, nd) };
}

function reconcileOutOfBounds(room: Room): Room {
  const items = room.items.map((item) => {
    const pos = clampPolygonInside(item, room.outline);
    return pos === item.pos ? item : { ...item, pos };
  });
  const openings = room.openings.map((o) => clampOpening(room.outline, room.ceiling, o));
  return { ...room, items, openings };
}

export const useStore = create<StoreState>()((set, get) => {
  const persistedDoc = loadPersistedDoc();
  const doc = persistedDoc ?? createDoc();

  function updateDoc(fn: (doc: Doc) => Doc) {
    set((state) => {
      const nextDoc = fn(state.doc);
      persistDocDebounced(nextDoc);
      return { doc: nextDoc };
    });
  }

  function updateRoom(roomId: string, fn: (room: Room) => Room) {
    updateDoc((d) => ({
      ...d,
      rooms: d.rooms.map((r) => (r.id === roomId ? fn(r) : r)),
    }));
  }

  function updateActiveRoom(fn: (room: Room) => Room) {
    const { activeRoomId } = get().doc;
    updateRoom(activeRoomId, fn);
  }

  return {
    doc,
    theme: initialTheme(),
    viewMode: "2d",
    cameraMode: "orbit",
    snapEnabled: true,
    snapStep: 0.25,
    sidebarOpen: false,
    wallsVisible: true,
    chatOpen: false,
    tourOpen: false,
    toasts: [],

    activeRoom: () => {
      const d = get().doc;
      return d.rooms.find((r) => r.id === d.activeRoomId) ?? d.rooms[0];
    },

    setTheme: (t) => {
      try {
        localStorage.setItem("room-planner:theme", t);
      } catch {
        /* ignore */
      }
      set({ theme: t });
    },
    toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
    setViewMode: (m) => set({ viewMode: m }),
    setCameraMode: (m) => set({ cameraMode: m }),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleWallsVisible: () => set((s) => ({ wallsVisible: !s.wallsVisible })),
    setChatOpen: (open) => set({ chatOpen: open }),
    setTourOpen: (open) => set({ tourOpen: open }),

    addRoom: () => {
      const d = get().doc;
      const name = `Room ${d.rooms.length + 1}`;
      const room = createRoom(name);
      updateDoc((doc2) => ({ ...doc2, rooms: [...doc2.rooms, room], activeRoomId: room.id }));
    },
    renameRoom: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateRoom(id, (r) => ({ ...r, name: trimmed }));
    },
    duplicateRoom: (id) => {
      const src = get().doc.rooms.find((r) => r.id === id);
      if (!src) return;
      const clone: Room = {
        ...src,
        id: uuid(),
        name: `${src.name} copy`,
        items: src.items.map((it) => ({ ...it, id: uuid() })),
        alcoves: src.alcoves.map((a) => ({ ...a, id: uuid() })),
        openings: src.openings.map((o) => ({ ...o, id: uuid() })),
        selectedItemId: null,
      };
      updateDoc((doc2) => ({ ...doc2, rooms: [...doc2.rooms, clone], activeRoomId: clone.id }));
    },
    deleteRoom: (id) => {
      const d = get().doc;
      if (d.rooms.length <= 1) {
        get().pushToast("Cannot delete the last room.", "error");
        return;
      }
      const rooms = d.rooms.filter((r) => r.id !== id);
      const activeRoomId = d.activeRoomId === id ? rooms[0].id : d.activeRoomId;
      updateDoc((doc2) => ({ ...doc2, rooms: doc2.rooms.filter((r) => r.id !== id), activeRoomId }));
    },
    setActiveRoomId: (id) => updateDoc((d) => ({ ...d, activeRoomId: id })),

    setRoomUnit: (unit) => updateActiveRoom((r) => ({ ...r, unit })),
    setRoomShape: (shape) => {
      const safeShape = clampRoomShape(shape);
      updateActiveRoom((r) => reconcileOutOfBounds({ ...r, shape: safeShape, outline: withOutline(safeShape, r.alcoves) }));
    },
    setRoomCeiling: (ceiling) => updateActiveRoom((r) => reconcileOutOfBounds({ ...r, ceiling })),
    addAlcove: (alcove) =>
      updateActiveRoom((r) => {
        const alcoves = [...r.alcoves, { ...alcove, id: uuid() }];
        return reconcileOutOfBounds({ ...r, alcoves, outline: withOutline(r.shape, alcoves) });
      }),
    removeAlcove: (id) =>
      updateActiveRoom((r) => {
        const alcoves = r.alcoves.filter((a) => a.id !== id);
        return reconcileOutOfBounds({ ...r, alcoves, outline: withOutline(r.shape, alcoves) });
      }),
    setMeasureMode: (mode) => updateActiveRoom((r) => ({ ...r, measureMode: mode })),

    addOpening: (opening) =>
      updateActiveRoom((r) => ({ ...r, openings: [...r.openings, clampOpening(r.outline, r.ceiling, opening)] })),
    updateOpening: (id, patch) =>
      updateActiveRoom((r) => ({
        ...r,
        openings: r.openings.map((o) => (o.id === id ? clampOpening(r.outline, r.ceiling, { ...o, ...patch }) : o)),
      })),
    removeOpening: (id) =>
      updateActiveRoom((r) => ({ ...r, openings: r.openings.filter((o) => o.id !== id) })),

    addItemFromPreset: (preset) => {
      const room = get().activeRoom();
      const item = itemFromPreset(preset, room);
      updateActiveRoom((r) => ({ ...r, items: [...r.items, item], selectedItemId: item.id }));
    },
    updateItem: (id, patch) =>
      updateActiveRoom((r) => ({
        ...r,
        items: r.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      })),
    moveItem: (id, pos, opts) =>
      updateActiveRoom((r) => {
        const { snapEnabled, snapStep } = get();
        const doSnap = snapEnabled && !opts?.skipSnap;
        const snappedPos = doSnap ? { x: snap(pos.x, snapStep), y: snap(pos.y, snapStep) } : pos;
        return {
          ...r,
          items: r.items.map((it) => {
            if (it.id !== id) return it;
            const moved = { ...it, pos: snappedPos };
            if (opts?.skipClamp) return moved;
            const clamped = clampPolygonInside(moved, r.outline);
            return { ...moved, pos: clamped };
          }),
        };
      }),
    rotateItem: (id, rotDeg) =>
      updateActiveRoom((r) => ({
        ...r,
        items: r.items.map((it) => {
          if (it.id !== id) return it;
          const normalized = ((rotDeg % 360) + 360) % 360;
          const rotated = { ...it, rotDeg: normalized };
          const pos = clampPolygonInside(rotated, r.outline);
          return { ...rotated, pos };
        }),
      })),
    resizeItem: (id, footprint, pos, opts) =>
      updateActiveRoom((r) => ({
        ...r,
        items: r.items.map((it) => {
          if (it.id !== id) return it;
          const resized = { ...it, footprint, pos };
          if (opts?.skipClamp) return resized;
          const clamped = clampPolygonInside(resized, r.outline);
          return { ...resized, pos: clamped };
        }),
      })),
    deleteItem: (id) =>
      updateActiveRoom((r) => ({
        ...r,
        items: r.items.filter((it) => it.id !== id),
        selectedItemId: r.selectedItemId === id ? null : r.selectedItemId,
      })),
    duplicateItem: (id) =>
      updateActiveRoom((r) => {
        const src = r.items.find((it) => it.id === id);
        if (!src) return r;
        const clone = cloneItem(src);
        const pos = clampPolygonInside(clone, r.outline);
        return { ...r, items: [...r.items, { ...clone, pos }], selectedItemId: clone.id };
      }),
    copyItemToRoom: (itemId, targetRoomId) => {
      const doc2 = get().doc;
      const activeRoomId = doc2.activeRoomId;
      const src = doc2.rooms.find((r) => r.id === activeRoomId)?.items.find((it) => it.id === itemId);
      if (!src) return;
      updateRoom(targetRoomId, (target) => {
        const clone = { ...cloneItem(src, 0), name: src.name };
        const pos = findFreeSpot(target, clone);
        return { ...target, items: [...target.items, { ...clone, pos }] };
      });
      get().pushToast(`Copied "${src.name}" to another room.`, "success");
    },
    toggleItemHidden: (id) =>
      updateActiveRoom((r) => ({
        ...r,
        items: r.items.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it)),
      })),
    selectItem: (id) => updateActiveRoom((r) => ({ ...r, selectedItemId: id })),

    exportDoc: () => {
      const d = get().doc;
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const room = get().activeRoom();
      const safeName = room.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "room";
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filename = `${safeName}-${stamp}.json`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      get().pushToast(`Saved "${filename}".`, "success");
    },
    importDoc: (json) => {
      try {
        const parsed = safeParseDoc(json);
        // add the loaded rooms alongside the existing ones (as new tabs) rather
        // than replacing the current document, so loading a file never destroys
        // work already open in the planner
        const newRooms = parsed.rooms.map((r) => ({
          ...r,
          id: uuid(),
          items: r.items.map((it) => ({ ...it, id: uuid() })),
          alcoves: r.alcoves.map((a) => ({ ...a, id: uuid() })),
          openings: r.openings.map((o) => ({ ...o, id: uuid() })),
          selectedItemId: null,
        }));
        updateDoc((doc2) => ({ ...doc2, rooms: [...doc2.rooms, ...newRooms], activeRoomId: newRooms[0].id }));
        get().pushToast(
          newRooms.length > 1 ? `Loaded ${newRooms.length} rooms.` : `Loaded "${newRooms[0].name}".`,
          "success",
        );
      } catch (e) {
        get().pushToast(e instanceof Error ? e.message : "Could not load file.", "error");
      }
    },
    resetDoc: () => updateDoc(() => createDoc()),

    pushToast: (message, variant = "info") => {
      const id = uuid();
      set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
      setTimeout(() => get().dismissToast(id), 4000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});
