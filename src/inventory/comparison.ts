import type { Doc, Item, Room, Unit } from "../model/types";
import { convertItem } from "../model/units";
import { localPolygon, worldPolygon, isFullyInside } from "../geometry/shape";
import { polygonArea } from "../geometry/polygon";
import { openingSpan } from "../geometry/openings";
import {
  canShareFloorSpace,
  footprintInteriorsOverlap,
  isFloorCovering,
  itemsCollide,
} from "../model/collision";
import type { InventoryEntry } from "./types";
import type { Vec2 } from "../geometry/types";

export type FitStatus =
  | "placed"
  | "not-placed"
  | "needs-layout"
  | "too-large"
  | "too-tall"
  | "different-dimensions";
export interface InventoryFit {
  inventoryId: string;
  name: string;
  quantity: number;
  placed: number;
  status: FitStatus;
  reason: string;
  roomId: string;
}
export type RoomAssignments = Record<string, string>;
export interface ComparisonResult {
  results: InventoryFit[];
  placed: number;
  total: number;
  issues: number;
}
export interface PlacementBudget {
  remaining: number;
  geometryRemaining: number;
  checked: number;
  exhausted: boolean;
}
export interface InventoryTrial {
  doc: Doc;
  added: number;
  unplaced: string[];
  unplacedIds: string[];
  checked: number;
  exhausted: boolean;
}

function newPlacementBudget(maxChecks = 8000): PlacementBudget {
  return {
    remaining: maxChecks,
    geometryRemaining: 250000,
    checked: 0,
    exhausted: false,
  };
}

function bounds(points: Vec2[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function itemFromInventory(entry: InventoryEntry, unit: Unit): Item {
  return convertItem(
    {
      id: crypto.randomUUID(),
      inventoryId: entry.id,
      name: entry.name,
      footprint: structuredClone(entry.footprint),
      height: entry.height,
      elevation: entry.elevation,
      color: entry.color,
      ...(entry.presetId ? { presetId: entry.presetId } : {}),
      pos: { x: 0, y: 0 },
      rotDeg: 0,
      hidden: false,
    },
    "m",
    unit,
  );
}

export function matchesInventoryDimensions(
  item: Item,
  unit: Unit,
  entry: InventoryEntry,
): boolean {
  const metric = convertItem(item, unit, "m");
  if (metric.footprint.kind !== entry.footprint.kind) return false;
  const equal = (a: number, b: number) => Math.abs(a - b) <= 1e-5;
  if (
    !equal(metric.height, entry.height) ||
    !equal(metric.elevation, entry.elevation)
  )
    return false;
  const actual = localPolygon(metric.footprint),
    expected = localPolygon(entry.footprint);
  return (
    actual.length === expected.length &&
    actual.every(
      (point, index) =>
        equal(point.x, expected[index].x) && equal(point.y, expected[index].y),
    )
  );
}

export function blocksDoor(item: Item, room: Room): boolean {
  if (item.hidden || isFloorCovering(item, room.unit)) return false;
  const polygon = worldPolygon(item);
  return room.openings.some((opening) => {
    if (opening.kind !== "door" || item.elevation >= opening.height)
      return false;
    const span = openingSpan(room.outline, opening);
    if (!span) return false;
    const hinge = opening.hinge === "left" ? span.start : span.end;
    const closed = opening.hinge === "left" ? span.end : span.start;
    const open = {
      x: hinge.x + span.inwardNormal.x * opening.width,
      y: hinge.y + span.inwardNormal.y * opening.width,
    };
    const start = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
    const cross =
      (closed.x - hinge.x) * (open.y - hinge.y) -
      (closed.y - hinge.y) * (open.x - hinge.x);
    const delta = ((cross > 0 ? 1 : -1) * Math.PI) / 2;
    const sector = [
      hinge,
      ...Array.from({ length: 13 }, (_, index) => ({
        x: hinge.x + Math.cos(start + (delta * index) / 12) * opening.width,
        y: hinge.y + Math.sin(start + (delta * index) / 12) * opening.width,
      })),
    ];
    return footprintInteriorsOverlap(polygon, sector);
  });
}

export function validInventoryPlacement(item: Item, room: Room): boolean {
  return (
    item.elevation + item.height <= room.ceiling + 1e-6 &&
    isFullyInside(worldPolygon(item), room.outline) &&
    !room.items.some(
      (other) => other.id !== item.id && itemsCollide(item, other, room.unit),
    ) &&
    !blocksDoor(item, room)
  );
}

/** A bounded search can find a valid arrangement, but failure never proves impossibility. */
export function findInventoryPlacement(
  entry: InventoryEntry,
  room: Room,
  budget: PlacementBudget = newPlacementBudget(),
): Item | null {
  const base = itemFromInventory(entry, room.unit);
  if (
    base.elevation + base.height > room.ceiling + 1e-6 ||
    room.items.length >= 500
  )
    return null;
  const roomXs = room.outline.map((p) => p.x),
    roomYs = room.outline.map((p) => p.y);
  const minX = Math.min(...roomXs),
    maxX = Math.max(...roomXs),
    minY = Math.min(...roomYs),
    maxY = Math.max(...roomYs);
  const obstacles = room.items
    .filter((item) => !canShareFloorSpace(base, item, room.unit))
    .map((item) => {
      const polygon = worldPolygon(item);
      return { polygon, bounds: bounds(polygon) };
    });
  const valid = (item: Item, polygon: Vec2[]): boolean => {
    const containmentCost = polygon.length * room.outline.length;
    if (budget.remaining <= 0 || budget.geometryRemaining < containmentCost) {
      budget.exhausted = true;
      return false;
    }
    budget.remaining--;
    budget.checked++;
    budget.geometryRemaining -= containmentCost;
    if (!isFullyInside(polygon, room.outline)) return false;
    const candidate = bounds(polygon);
    for (const obstacle of obstacles) {
      const other = obstacle.bounds;
      if (
        candidate.maxX <= other.minX + 1e-6 ||
        other.maxX <= candidate.minX + 1e-6 ||
        candidate.maxY <= other.minY + 1e-6 ||
        other.maxY <= candidate.minY + 1e-6
      )
        continue;
      const cost = polygon.length * obstacle.polygon.length;
      if (budget.geometryRemaining < cost) {
        budget.exhausted = true;
        return false;
      }
      budget.geometryRemaining -= cost;
      if (footprintInteriorsOverlap(polygon, obstacle.polygon)) return false;
    }
    return !blocksDoor(item, room);
  };
  for (const rotation of [0, 90, 180, 270]) {
    const template = { ...base, rotDeg: rotation };
    const local = worldPolygon(template);
    const left = Math.min(...local.map((p) => p.x)),
      top = Math.min(...local.map((p) => p.y));
    const width = Math.max(...local.map((p) => p.x)) - left,
      depth = Math.max(...local.map((p) => p.y)) - top;
    if (width > maxX - minX + 1e-6 || depth > maxY - minY + 1e-6) continue;
    const xs = new Set([minX, maxX - width, (minX + maxX - width) / 2]);
    const ys = new Set([minY, maxY - depth, (minY + maxY - depth) / 2]);
    for (const point of room.outline) {
      xs.add(point.x);
      xs.add(point.x - width);
      ys.add(point.y);
      ys.add(point.y - depth);
    }
    for (const obstacle of obstacles.slice(0, 40)) {
      xs.add(obstacle.bounds.minX - width);
      xs.add(obstacle.bounds.maxX);
      ys.add(obstacle.bounds.minY - depth);
      ys.add(obstacle.bounds.maxY);
    }
    const insideXs = [...xs]
      .filter((x) => x >= minX - 1e-6 && x + width <= maxX + 1e-6)
      .slice(0, 30);
    const insideYs = [...ys]
      .filter((y) => y >= minY - 1e-6 && y + depth <= maxY + 1e-6)
      .slice(0, 30);
    let checked = 0;
    for (const y of insideYs)
      for (const x of insideXs) {
        if (++checked > 250) break;
        const item = { ...template, pos: { x: x - left, y: y - top } };
        const polygon = local.map((point) => ({
          x: point.x + item.pos.x,
          y: point.y + item.pos.y,
        }));
        if (valid(item, polygon)) return item;
        if (budget.exhausted) return null;
      }
    for (let row = 0; row <= 8; row++)
      for (let column = 0; column <= 8; column++) {
        const item = {
          ...template,
          pos: {
            x: minX + ((maxX - minX - width) * column) / 8 - left,
            y: minY + ((maxY - minY - depth) * row) / 8 - top,
          },
        };
        const polygon = local.map((point) => ({
          x: point.x + item.pos.x,
          y: point.y + item.pos.y,
        }));
        if (valid(item, polygon)) return item;
        if (budget.exhausted) return null;
      }
  }
  return null;
}

export function defaultAssignments(
  doc: Doc,
  entries: InventoryEntry[],
): RoomAssignments {
  return Object.fromEntries(
    entries.map((entry) => [
      entry.id,
      doc.rooms.find(
        (room) =>
          entry.roomHint &&
          room.name.toLowerCase() === entry.roomHint.toLowerCase(),
      )?.id ?? doc.rooms[0].id,
    ]),
  );
}

function roomFor(
  doc: Doc,
  entry: InventoryEntry,
  assignments: RoomAssignments,
): Room {
  return (
    doc.rooms.find((room) => room.id === assignments[entry.id]) ?? doc.rooms[0]
  );
}

function diameter(points: { x: number; y: number }[]) {
  let maximum = 0;
  for (const a of points)
    for (const b of points)
      maximum = Math.max(maximum, Math.hypot(a.x - b.x, a.y - b.y));
  return maximum;
}

export function compareInventory(
  doc: Doc,
  entries: InventoryEntry[],
  assignments: RoomAssignments = defaultAssignments(doc, entries),
): ComparisonResult {
  const results = entries.map((entry): InventoryFit => {
    const room = roomFor(doc, entry, assignments);
    const instances = room.items.filter(
      (item) => item.inventoryId === entry.id && !item.hidden,
    );
    const dimensionMatches = instances.filter((item) =>
      matchesInventoryDimensions(item, room.unit, entry),
    );
    const valid = dimensionMatches.filter((item) =>
      validInventoryPlacement(item, room),
    );
    const placed = Math.min(entry.quantity, valid.length);
    const common = {
      inventoryId: entry.id,
      name: entry.name,
      quantity: entry.quantity,
      placed,
      roomId: room.id,
    };
    const apartmentInstances = doc.rooms.reduce(
      (sum, current) =>
        sum +
        current.items.filter(
          (item) => item.inventoryId === entry.id && !item.hidden,
        ).length,
      0,
    );
    if (apartmentInstances > entry.quantity)
      return {
        ...common,
        status: "needs-layout",
        reason: `${apartmentInstances} copies in this design; ${entry.quantity} owned`,
      };
    if (placed >= entry.quantity)
      return {
        ...common,
        status: "placed",
        reason: `${placed} of ${entry.quantity} placed`,
      };
    if (instances.length > dimensionMatches.length)
      return {
        ...common,
        status: "different-dimensions",
        reason: "Layout dimensions differ from saved furniture",
      };
    if (dimensionMatches.length > valid.length) {
      const blocked = dimensionMatches.some((item) => blocksDoor(item, room));
      return {
        ...common,
        status: "needs-layout",
        reason: blocked
          ? "A placed item blocks a door swing"
          : "A placed item overlaps, exceeds the room, or is too tall",
      };
    }
    const metricRoom = {
      outline: room.outline.map((point) => ({
        x: point.x * (room.unit === "ft" ? 0.3048 : 1),
        y: point.y * (room.unit === "ft" ? 0.3048 : 1),
      })),
    };
    if (
      entry.height + entry.elevation >
      room.ceiling * (room.unit === "ft" ? 0.3048 : 1) + 1e-6
    )
      return {
        ...common,
        status: "too-tall",
        reason: `Exceeds the ceiling in ${room.name}`,
      };
    const polygon = localPolygon(entry.footprint);
    if (
      polygonArea(polygon) > polygonArea(metricRoom.outline) + 1e-6 ||
      diameter(polygon) > diameter(metricRoom.outline) + 1e-6
    )
      return {
        ...common,
        status: "too-large",
        reason: `Cannot fit inside ${room.name} at its saved size`,
      };
    if (
      instances.length ||
      doc.rooms.some(
        (other) =>
          other.id !== room.id &&
          other.items.some(
            (item) => item.inventoryId === entry.id && !item.hidden,
          ),
      )
    )
      return {
        ...common,
        status: "needs-layout",
        reason: `Place ${entry.quantity - placed} more in ${room.name}`,
      };
    return {
      ...common,
      status: "not-placed",
      reason: `Not placed in ${room.name}`,
    };
  });
  return {
    results,
    placed: results.reduce((sum, result) => sum + result.placed, 0),
    total: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    issues: results.filter((result) => result.status !== "placed").length,
  };
}

/** Add missing pieces on a copy only. Existing items, including built-ins, are never removed. */
export function createInventoryTrial(
  doc: Doc,
  entries: InventoryEntry[],
  assignments: RoomAssignments = defaultAssignments(doc, entries),
  options: { maxChecks?: number } = {},
): InventoryTrial {
  const trial = structuredClone(doc);
  let added = 0;
  const unplaced: string[] = [];
  const unplacedIds: string[] = [];
  const budget = newPlacementBudget(
    Math.max(0, Math.min(8000, options.maxChecks ?? 8000)),
  );
  const largestFirst = [...entries].sort(
    (a, b) =>
      polygonArea(localPolygon(b.footprint)) -
      polygonArea(localPolygon(a.footprint)),
  );
  for (const entry of largestFirst) {
    const room = roomFor(trial, entry, assignments);
    const existing = trial.rooms.reduce(
      (sum, current) =>
        sum +
        current.items.filter(
          (item) => item.inventoryId === entry.id && !item.hidden,
        ).length,
      0,
    );
    for (let number = existing; number < entry.quantity; number++) {
      if (added >= 200) {
        unplaced.push(entry.name);
        unplacedIds.push(entry.id);
        break;
      }
      const item = findInventoryPlacement(entry, room, budget);
      if (!item) {
        unplaced.push(entry.name);
        unplacedIds.push(entry.id);
        break;
      }
      room.items.push(item);
      added++;
    }
  }
  return {
    doc: trial,
    added,
    unplaced,
    unplacedIds,
    checked: budget.checked,
    exhausted: budget.exhausted,
  };
}

/** A failed search is a layout task, never evidence that the furniture cannot fit. */
export function compareInventoryTrial(
  trial: InventoryTrial,
  entries: InventoryEntry[],
  assignments?: RoomAssignments,
): ComparisonResult {
  const result = compareInventory(trial.doc, entries, assignments);
  result.results = result.results.map((fit) =>
    trial.unplacedIds.includes(fit.inventoryId) &&
    (fit.status === "not-placed" || fit.status === "needs-layout")
      ? {
          ...fit,
          status: "needs-layout",
          reason: trial.exhausted
            ? "Placement search reached its limit; arrange this piece manually"
            : "No clear placement found among existing furniture",
        }
      : fit,
  );
  return result;
}
