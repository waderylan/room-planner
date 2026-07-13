import type { Vec2 } from "../geometry/types";

export type Unit = "ft" | "m";

export type Footprint =
  | { kind: "rect"; w: number; d: number }
  | { kind: "circle"; r: number }
  | { kind: "poly"; points: Vec2[] };

export interface Item {
  id: string;
  name: string;
  footprint: Footprint;
  pos: Vec2;
  rotDeg: number;
  height: number;
  elevation: number;
  color: string;
  hidden: boolean;
}

export type MeasureMode = "wall" | "furniture";

/** Axis-aligned room-shape editing primitives, kept alongside the derived outline. */
export type RoomShapeKind = "rect" | "lshape";

export type NotchCorner = "nw" | "ne" | "sw" | "se";

export interface RoomShape {
  kind: RoomShapeKind;
  width: number;
  length: number;
  // present when kind === "lshape"
  notchCorner?: NotchCorner;
  notchWidth?: number;
  notchDepth?: number;
}

export type AlcoveWall = "n" | "e" | "s" | "w";

export interface Alcove {
  id: string;
  wall: AlcoveWall;
  offset: number;
  width: number;
  depth: number;
}

export type OpeningKind = "window" | "door";
export type DoorHinge = "left" | "right";

/**
 * A window or door cut into a wall. `wallIndex` refers to the outline edge
 * `outline[wallIndex] -> outline[(wallIndex + 1) % outline.length]`; since
 * outline edges are regenerated from `shape`/`alcoves`, openings are
 * reclamped (see geometry/openings.ts clampOpening) any time the outline
 * changes so they never end up floating past a wall's actual length.
 */
export interface Opening {
  id: string;
  kind: OpeningKind;
  wallIndex: number;
  /** distance along the wall (from outline[wallIndex]) to the near edge of the opening */
  offset: number;
  width: number;
  /** vertical extent of the opening */
  height: number;
  /** height of the opening's bottom edge above the floor; doors are always 0 */
  sillHeight: number;
  /** which end of the opening the door is hinged on (unused for windows) */
  hinge: DoorHinge;
}

export interface Room {
  id: string;
  name: string;
  unit: Unit;
  outline: Vec2[];
  shape: RoomShape;
  alcoves: Alcove[];
  openings: Opening[];
  ceiling: number;
  items: Item[];
  selectedItemId: string | null;
  measureMode: MeasureMode;
}

export interface Doc {
  version: 4;
  rooms: Room[];
  activeRoomId: string;
}
