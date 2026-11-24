import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Alcove, Doc, Item, MeasureMode, Opening, Room, RoomShape } from "../model/types";
import { cloneItem, createDoc, createRoom, itemFromPreset } from "../model/factory";
import { findFreeSpot } from "../model/freeSpot";
import type { FurniturePreset } from "../model/presets";
import { migrateAlcove, migrateDoc, migrateItem, migrateOpening, migrateShape, safeParseDoc } from "../model/migrate";
import { buildOutline } from "../geometry/roomOutline";
import { clampPolygonInside } from "../geometry/shape";
import { clampOpening } from "../geometry/openings";
import { snap } from "../geometry/polygon";
import { createLibraryPersistence, loadLibrary, validateProject, type Project, type SaveStatus } from "./persistence";
import { convertItem, convertRoom } from "../model/units";
import type { Toast, ToastVariant } from "./toast";
import { downloadDesign } from "../lib/files";

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
  projects: Project[];
  activeProjectId: string;
  saveStatus: SaveStatus;
  saveError: string | null;
  historyPast: Doc[];
  historyFuture: Doc[];
  undo: () => void;
  redo: () => void;
  withHistoryGroup: <T>(token: string, fn: () => T) => T;
  createProject: (name?: string, doc?: Doc) => string;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => string | null;
  deleteProject: (id: string) => void;
  upsertProject: (project: Project) => boolean;
  importProject: (json: string, name?: string) => boolean;
  flushSave: () => boolean;
  theme: Theme;
  viewMode: ViewMode;
  cameraMode: CameraMode;
  snapEnabled: boolean;
  snapStep: number;
  resizeSensitivity: number;
  sidebarOpen: boolean;
  wallsVisible: boolean;
  chatOpen: boolean;
  toasts: Toast[];

  // derived helpers
  activeRoom: () => Room;

  // doc-level
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setViewMode: (m: ViewMode) => void;
  setCameraMode: (m: CameraMode) => void;
  toggleSnap: () => void;
  setResizeSensitivity: (v: number) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleWallsVisible: () => void;
  setChatOpen: (open: boolean) => void;

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
  const margin = Math.min(0.1, shape.width / 4, shape.length / 4);
  const nw = Math.min(shape.notchWidth ?? shape.width / 2, shape.width - margin);
  const nd = Math.min(shape.notchDepth ?? shape.length / 2, shape.length - margin);
  return { ...shape, notchWidth: Math.max(margin, nw), notchDepth: Math.max(margin, nd) };
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
  let loaded: ReturnType<typeof loadLibrary>;
  try { loaded = loadLibrary(localStorage); }
  catch { loaded = { library: null, raw: null, error: "Device storage is unavailable. Export a backup before closing." }; }
  const now = new Date().toISOString();
  const initialProject: Project = { id: uuid(), name: "Untitled design", doc: createDoc(), createdAt: now, updatedAt: now };
  const projects = loaded.library?.projects ?? [initialProject];
  const activeProjectId = loaded.library?.activeProjectId ?? initialProject.id;
  const doc = projects.find((p) => p.id === activeProjectId)!.doc;
  const persistence = createLibraryPersistence(() => localStorage, (saveStatus, saveError) => set({ saveStatus, saveError }), loaded.raw);
  let lastHistoryGroup: string | undefined;
  let lastHistoryAt = 0;
  let forcedHistoryGroup: string | undefined;

  function persistCurrent(immediate = false) {
    const { projects: currentProjects, activeProjectId: currentId } = get();
    persistence.schedule({ version: 1, projects: currentProjects, activeProjectId: currentId });
    if (immediate) persistence.flush();
  }

  function resetHistory() {
    lastHistoryGroup = undefined;
    lastHistoryAt = 0;
    return { historyPast: [] as Doc[], historyFuture: [] as Doc[] };
  }

  function updateDoc(fn: (doc: Doc) => Doc, options?: { record?: boolean; group?: string; touch?: boolean }) {
    const state = get();
    let nextDoc: Doc;
    try { nextDoc = fn(state.doc); }
    catch (error) {
      get().pushToast(error instanceof Error ? error.message : "Could not update design.", "error");
      return;
    }
    if (nextDoc === state.doc) return;
    const record = options?.record !== false;
    const timestamp = Date.now();
    const group = forcedHistoryGroup ? `transaction:${state.activeProjectId}:${forcedHistoryGroup}` : options?.group;
    const coalesce = !!group && lastHistoryGroup === group && (!!forcedHistoryGroup || timestamp - lastHistoryAt < 600);
    const history = record ? {
      historyPast: coalesce ? state.historyPast : [...state.historyPast.slice(-79), state.doc],
      historyFuture: [],
    } : {};
    if (record) { lastHistoryGroup = group; lastHistoryAt = timestamp; }
    set({
      doc: nextDoc,
      projects: state.projects.map((p) => p.id === state.activeProjectId ? { ...p, doc: nextDoc, ...(options?.touch === false ? {} : { updatedAt: new Date().toISOString() }) } : p),
      snapStep: nextDoc.rooms.find((r) => r.id === nextDoc.activeRoomId)?.unit === "m" ? 0.1 : 0.25,
      ...history,
    });
    persistCurrent();
  }

  function updateRoom(roomId: string, fn: (room: Room) => Room, options?: { record?: boolean; group?: string; touch?: boolean }) {
    updateDoc((d) => {
      const room = d.rooms.find((r) => r.id === roomId);
      if (!room) return d;
      const nextRoom = fn(room);
      if (nextRoom === room) return d;
      return { ...d, rooms: d.rooms.map((r) => r.id === roomId ? nextRoom : r) };
    }, options);
  }

  function updateActiveRoom(fn: (room: Room) => Room, options?: { record?: boolean; group?: string; touch?: boolean }) {
    const { activeRoomId } = get().doc;
    updateRoom(activeRoomId, fn, options);
  }

  // Give a new or migrated design a durable identity before the first editor action.
  // Never replace unreadable storage merely because the application was opened.
  if (!loaded.raw && !loaded.error) queueMicrotask(() => persistCurrent(true));

  if (typeof window !== "undefined") {
    const onPageHide = () => { persistence.flush(); };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") persistence.flush(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!persistence.flush() || get().saveStatus === "error") {
        event.preventDefault();
      }
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    import.meta.hot?.dispose(() => {
      persistence.flush();
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    });
  }

  return {
    doc,
    projects,
    activeProjectId,
    saveStatus: loaded.error ? "error" : "saved",
    saveError: loaded.error,
    historyPast: [],
    historyFuture: [],
    flushSave: () => persistence.flush(),
    withHistoryGroup: (token, fn) => {
      const previous = forcedHistoryGroup;
      forcedHistoryGroup = token;
      try { return fn(); }
      finally { forcedHistoryGroup = previous; }
    },
    undo: () => {
      const state = get();
      const previous = state.historyPast.at(-1);
      if (!previous) return;
      lastHistoryGroup = undefined;
      updateDoc(() => previous, { record: false });
      set({ historyPast: state.historyPast.slice(0, -1), historyFuture: [state.doc, ...state.historyFuture].slice(0, 80) });
    },
    redo: () => {
      const state = get();
      const next = state.historyFuture[0];
      if (!next) return;
      lastHistoryGroup = undefined;
      updateDoc(() => next, { record: false });
      set({ historyPast: [...state.historyPast, state.doc].slice(-80), historyFuture: state.historyFuture.slice(1) });
    },
    createProject: (name = "Untitled design", suppliedDoc) => {
      if (get().projects.length >= 200) {
        get().pushToast("This device has 200 designs. Export and remove a design first.", "error");
        return get().activeProjectId;
      }
      const nextDoc = suppliedDoc ? safeParseDoc(JSON.stringify(suppliedDoc)) : createDoc();
      const timestamp = new Date().toISOString();
      const project: Project = { id: uuid(), name: name.trim().slice(0, 120) || "Untitled design", doc: nextDoc, createdAt: timestamp, updatedAt: timestamp };
      set((s) => ({ projects: [...s.projects, project], activeProjectId: project.id, doc: nextDoc, viewMode: "2d", snapStep: nextDoc.rooms.find((r) => r.id === nextDoc.activeRoomId)?.unit === "m" ? 0.1 : 0.25, ...resetHistory() }));
      persistCurrent(true);
      return project.id;
    },
    openProject: (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project || id === get().activeProjectId) return;
      set({ activeProjectId: id, doc: project.doc, viewMode: "2d", snapStep: project.doc.rooms.find((r) => r.id === project.doc.activeRoomId)?.unit === "m" ? 0.1 : 0.25, ...resetHistory() });
      persistCurrent(true);
    },
    renameProject: (id, name) => {
      const trimmed = name.trim().slice(0, 120);
      if (!trimmed) return;
      set((s) => ({ projects: s.projects.map((p) => p.id === id ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p) }));
      persistCurrent(true);
    },
    duplicateProject: (id) => {
      if (get().projects.length >= 200) { get().pushToast("This device has 200 designs. Export and remove a design first.", "error"); return null; }
      const project = get().projects.find((p) => p.id === id);
      return project ? get().createProject(`${project.name} copy`, project.doc) : null;
    },
    deleteProject: (id) => {
      const state = get();
      const remaining = state.projects.filter((p) => p.id !== id);
      if (remaining.length === state.projects.length) return;
      if (!remaining.length) {
        const timestamp = new Date().toISOString();
        remaining.push({ id: uuid(), name: "Untitled design", doc: createDoc(), createdAt: timestamp, updatedAt: timestamp });
      }
      const active = remaining.find((p) => p.id === state.activeProjectId) ?? remaining[0];
      set({ projects: remaining, activeProjectId: active.id, doc: active.doc, ...resetHistory() });
      persistCurrent(true);
    },
    upsertProject: (value) => {
      try {
        const project = validateProject(value);
        const state = get();
        const exists = state.projects.some((p) => p.id === project.id);
        if (!exists && state.projects.length >= 200) throw new Error("This device has 200 designs. Export and remove a design first.");
        set({ projects: exists ? state.projects.map((p) => p.id === project.id ? project : p) : [...state.projects, project], ...(state.activeProjectId === project.id ? { doc: project.doc, ...resetHistory() } : {}) });
        persistCurrent(true);
        return get().saveStatus !== "error";
      } catch (error) {
        get().pushToast(error instanceof Error ? error.message : "Could not load design.", "error");
        return false;
      }
    },
    importProject: (json, name = "Imported design") => {
      try {
        if (get().projects.length >= 200) throw new Error("This device has 200 designs. Export and remove a design first.");
        const parsed = safeParseDoc(json);
        get().createProject(name, parsed);
        get().pushToast("Design imported.", "success");
        return true;
      } catch (error) {
        get().pushToast(error instanceof Error ? error.message : "Could not import design.", "error");
        return false;
      }
    },
    theme: initialTheme(),
    viewMode: "2d",
    cameraMode: "orbit",
    snapEnabled: true,
    snapStep: doc.rooms.find((r) => r.id === doc.activeRoomId)?.unit === "m" ? 0.1 : 0.25,
    resizeSensitivity: 0.5,
    sidebarOpen: false,
    wallsVisible: true,
    chatOpen: false,
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
    setResizeSensitivity: (v) => set({ resizeSensitivity: Math.min(1.5, Math.max(0.1, v)) }),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleWallsVisible: () => set((s) => ({ wallsVisible: !s.wallsVisible })),
    setChatOpen: (open) => set({ chatOpen: open }),

    addRoom: () => {
      const d = get().doc;
      if (d.rooms.length >= 50) { get().pushToast("A design can contain up to 50 rooms.", "error"); return; }
      const name = `Room ${d.rooms.length + 1}`;
      const room = createRoom(name);
      updateDoc((doc2) => ({ ...doc2, rooms: [...doc2.rooms, room], activeRoomId: room.id }));
    },
    renameRoom: (id, name) => {
      const trimmed = name.trim().slice(0, 120);
      if (!trimmed) return;
      updateRoom(id, (r) => ({ ...r, name: trimmed }));
    },
    duplicateRoom: (id) => {
      if (get().doc.rooms.length >= 50) { get().pushToast("A design can contain up to 50 rooms.", "error"); return; }
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
    setActiveRoomId: (id) => {
      const room = get().doc.rooms.find((r) => r.id === id);
      if (!room) return;
      if (get().doc.activeRoomId === id) return;
      updateDoc((d) => ({ ...d, activeRoomId: id }), { record: false, touch: false });
      set({ snapStep: room.unit === "m" ? 0.1 : 0.25 });
    },

    setRoomUnit: (unit) => {
      updateActiveRoom((r) => {
        const converted = convertRoom(r, unit);
        if (converted !== r) migrateDoc({ version: 4, rooms: [converted], activeRoomId: converted.id });
        return converted;
      });
    },
    setRoomShape: (shape) => {
      updateActiveRoom((r) => {
        const safeShape = migrateShape(clampRoomShape(shape));
        const alcoves = r.alcoves.map((a) => migrateAlcove(a, safeShape));
        return reconcileOutOfBounds({ ...r, shape: safeShape, alcoves, outline: withOutline(safeShape, alcoves) });
      }, { group: "room-shape" });
    },
    setRoomCeiling: (ceiling) => {
      if (!Number.isFinite(ceiling) || ceiling < 0.1 || ceiling > 1000) return;
      updateActiveRoom((r) => reconcileOutOfBounds({ ...r, ceiling }), { group: "room-ceiling" });
    },
    addAlcove: (alcove) =>
      updateActiveRoom((r) => {
        if (r.alcoves.length >= 24) throw new Error("A room can contain up to 24 alcoves.");
        const alcoves = [...r.alcoves, migrateAlcove({ ...alcove, id: uuid() }, r.shape)];
        return reconcileOutOfBounds({ ...r, alcoves, outline: withOutline(r.shape, alcoves) });
      }),
    removeAlcove: (id) =>
      updateActiveRoom((r) => {
        const alcoves = r.alcoves.filter((a) => a.id !== id);
        return reconcileOutOfBounds({ ...r, alcoves, outline: withOutline(r.shape, alcoves) });
      }),
    setMeasureMode: (mode) => updateActiveRoom((r) => ({ ...r, measureMode: mode }), { record: false, touch: false }),

    addOpening: (opening) =>
      updateActiveRoom((r) => {
        if (r.openings.length >= 100) throw new Error("A room can contain up to 100 openings.");
        return { ...r, openings: [...r.openings, migrateOpening(opening, r.outline, r.ceiling)] };
      }),
    updateOpening: (id, patch) =>
      updateActiveRoom((r) => ({
        ...r,
        openings: r.openings.map((o) => (o.id === id ? migrateOpening({ ...o, ...patch, id: o.id }, r.outline, r.ceiling) : o)),
      }), { group: `opening:${id}` }),
    removeOpening: (id) =>
      updateActiveRoom((r) => ({ ...r, openings: r.openings.filter((o) => o.id !== id) })),

    addItemFromPreset: (preset) => {
      const room = get().activeRoom();
      if (room.items.length >= 500) { get().pushToast("A room can contain up to 500 furniture items.", "error"); return; }
      const item = itemFromPreset(preset, room);
      updateActiveRoom((r) => ({ ...r, items: [...r.items, item], selectedItemId: item.id }));
    },
    updateItem: (id, patch) =>
      updateActiveRoom((r) => ({
        ...r,
        items: r.items.map((it) => {
          if (it.id !== id) return it;
          const updated = migrateItem({ ...it, ...patch, id: it.id });
          return { ...updated, pos: clampPolygonInside(updated, r.outline) };
        }),
      }), { group: `item:${id}:${Object.keys(patch).sort().join(",")}` }),
    moveItem: (id, pos, opts) =>
      updateActiveRoom((r) => {
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return r;
        const { snapEnabled, snapStep } = get();
        const doSnap = snapEnabled && !opts?.skipSnap;
        const snappedPos = doSnap ? { x: snap(pos.x, snapStep), y: snap(pos.y, snapStep) } : pos;
        return {
          ...r,
          items: r.items.map((it) => {
            if (it.id !== id) return it;
            const moved = migrateItem({ ...it, pos: snappedPos });
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
          if (!Number.isFinite(rotDeg)) return it;
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
          const resized = migrateItem({ ...it, footprint, pos });
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
        if (r.items.length >= 500) throw new Error("A room can contain up to 500 furniture items.");
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
        if (target.items.length >= 500) throw new Error("A room can contain up to 500 furniture items.");
        const sourceRoom = doc2.rooms.find((r) => r.id === activeRoomId)!;
        const clone = { ...cloneItem(convertItem(src, sourceRoom.unit, target.unit), 0), name: src.name };
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
    selectItem: (id) => updateActiveRoom((r) => r.selectedItemId === id ? r : ({ ...r, selectedItemId: id }), { record: false, touch: false }),

    exportDoc: () => {
      const state = get();
      const project = state.projects.find((p) => p.id === state.activeProjectId)!;
      downloadDesign(state.doc, project.name);
      get().pushToast("Design exported.", "success");
    },
    importDoc: (json) => { get().importProject(json); },
    resetDoc: () => updateDoc(() => createDoc()),

    pushToast: (message, variant = "info") => {
      const id = uuid();
      set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
      setTimeout(() => get().dismissToast(id), 4000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});
