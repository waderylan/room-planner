import type { JSONSchema, ToolDef } from "./types";

const vec2Schema: JSONSchema = {
  type: "number",
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_room_state",
    description:
      "Read the full current state of the active room: shape, unit, ceiling height, outline walls (in order, each wall i runs from outline[i] to outline[i+1]), alcoves, windows/doors, and every furniture item. Call this first to see what already exists before adding or moving things.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_presets",
    description:
      "List the furniture presets available for add_item/place_item, with their id, default footprint (width x depth in room units), default height, and color. Use \"custom\" as a presetId for a plain rectangle you size yourself.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "describe_walls",
    description:
      "List every wall of the current room with its outline edge index (the wallIndex used by add_opening), its cardinal side (n/e/s/w, or \"angled\" for L-shape diagonals), its endpoints, length, and the direction that points into the room. Call this to decide which wall to put a window or door on, or to reason about where a cardinal side actually is.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "set_room_shape",
    description:
      "Set the room's floor shape. Use kind \"rect\" for a plain rectangle (width x length), or \"lshape\" for an L-shaped room with a rectangular notch removed from one corner.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["rect", "lshape"] },
        width: { type: "number", description: "Overall width in room units" },
        length: { type: "number", description: "Overall length (depth) in room units" },
        notchCorner: {
          type: "string",
          enum: ["nw", "ne", "sw", "se"],
          description: "Which corner is cut away, only for kind=lshape",
        },
        notchWidth: { type: "number", description: "Notch width, only for kind=lshape" },
        notchDepth: { type: "number", description: "Notch depth, only for kind=lshape" },
      },
      required: ["kind", "width", "length"],
    },
  },
  {
    name: "set_room_unit",
    description: "Set the display unit for the active room.",
    parameters: {
      type: "object",
      properties: { unit: { type: "string", enum: ["ft", "m"] } },
      required: ["unit"],
    },
  },
  {
    name: "set_ceiling",
    description: "Set the ceiling height of the active room, in room units.",
    parameters: {
      type: "object",
      properties: { height: { type: "number" } },
      required: ["height"],
    },
  },
  {
    name: "add_alcove",
    description: "Add a rectangular bump-out (alcove) attached to one wall of the room.",
    parameters: {
      type: "object",
      properties: {
        wall: { type: "string", enum: ["n", "e", "s", "w"], description: "Which side of the room's bounding box" },
        offset: { type: "number", description: "Distance along the wall to the near edge of the alcove" },
        width: { type: "number" },
        depth: { type: "number" },
      },
      required: ["wall", "offset", "width", "depth"],
    },
  },
  {
    name: "remove_alcove",
    description: "Remove an alcove by id.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "add_opening",
    description:
      "Add a window or door cut into a wall. wallIndex refers to the outline edge index from get_room_state. offset is the distance along that wall (from its start point) to the near edge of the opening.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["window", "door"] },
        wallIndex: { type: "number" },
        offset: { type: "number" },
        width: { type: "number" },
        height: { type: "number", description: "Vertical extent of the opening" },
        sillHeight: { type: "number", description: "Height of the opening's bottom edge above the floor; ignored (always 0) for doors" },
        hinge: { type: "string", enum: ["left", "right"], description: "Only relevant for doors" },
      },
      required: ["kind", "wallIndex", "offset", "width", "height", "sillHeight"],
    },
  },
  {
    name: "remove_opening",
    description: "Remove a window or door by id.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "place_item",
    description:
      "PREFERRED way to add furniture. Adds a piece from a preset and positions it by intent instead of raw coordinates: against a wall, in a corner, in the center, or beside another item. The engine computes a non-overlapping, in-bounds position and a sensible rotation for you (so you never have to do the geometry), sliding the piece to the nearest free spot if the exact target is taken. Returns the item's id, where it ended up (center), and whether it had to be nudged. Prefer this over add_item unless the user gave an exact coordinate.",
    parameters: {
      type: "object",
      properties: {
        presetId: { type: "string", description: "A preset id from list_presets, or \"custom\"" },
        placement: {
          type: "string",
          enum: ["wall", "corner", "center", "beside"],
          description: "How to position the piece.",
        },
        wall: {
          type: "string",
          enum: ["n", "e", "s", "w"],
          description: "For placement=wall: which wall to put it flush against (n=north/top, s=south/bottom, w=west/left, e=east/right).",
        },
        corner: {
          type: "string",
          enum: ["nw", "ne", "sw", "se"],
          description: "For placement=corner: which corner.",
        },
        ref: {
          type: "string",
          description: "For placement=beside: the id of the item to place next to.",
        },
        side: {
          type: "string",
          enum: ["n", "e", "s", "w"],
          description: "For placement=beside: which side of the reference item (n=above/north, s=below/south, w=left/west, e=right/east).",
        },
        align: {
          type: "string",
          enum: ["start", "center", "end"],
          description: "How to align along the wall or shared edge. Defaults to center. For a wall: start=left/top end, end=right/bottom end.",
        },
        gap: {
          type: "number",
          description: "Clearance in room units to leave between the piece and the wall or reference item. Defaults to 0 (flush).",
        },
        rotDeg: { type: "number", description: "Override the automatic rotation, in degrees 0-360." },
        color: { type: "string", description: "Hex color like #5b8def" },
        name: { type: "string" },
        width: { type: "number", description: "Override footprint width (rect footprints only)" },
        depth: { type: "number", description: "Override footprint depth (rect footprints only)" },
        height: { type: "number", description: "Override vertical height for the 3D view" },
        elevation: { type: "number", description: "Override height off the floor" },
      },
      required: ["presetId", "placement"],
    },
  },
  {
    name: "move_item",
    description:
      "Reposition an existing furniture item by intent (against a wall, in a corner, centered, or beside another item), exactly like place_item but for a piece that already exists. The engine finds a non-overlapping, in-bounds spot for you. Use this to fix overlaps reported by check_room or to rearrange the room.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id of the item to move." },
        placement: { type: "string", enum: ["wall", "corner", "center", "beside"] },
        wall: { type: "string", enum: ["n", "e", "s", "w"] },
        corner: { type: "string", enum: ["nw", "ne", "sw", "se"] },
        ref: { type: "string", description: "For placement=beside: the id of the item to place next to." },
        side: { type: "string", enum: ["n", "e", "s", "w"] },
        align: { type: "string", enum: ["start", "center", "end"] },
        gap: { type: "number" },
        rotDeg: { type: "number" },
      },
      required: ["id", "placement"],
    },
  },
  {
    name: "check_room",
    description:
      "Validate the current layout: returns any pairs of furniture that overlap, any items sticking outside the room, and room/used/free floor area. Call this after placing several pieces to confirm nothing intersects, then fix problems with move_item.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "clear_items",
    description:
      "Remove all furniture from the active room (leaves the room shape, walls, and openings intact). Useful before laying out a room from scratch or fully redesigning it.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "add_item",
    description:
      "Add a piece of furniture at an EXACT coordinate. Prefer place_item for natural-language layout; use this only when you truly need a specific x/y. If x/y are omitted, the item is auto-placed at the first free spot. Position is the top-left of the footprint before rotation, in room units, y increasing into the room. The result reports whether the piece overlaps anything, so you can follow up with move_item. Returns the new item's id.",
    parameters: {
      type: "object",
      properties: {
        presetId: { type: "string", description: "A preset id from list_presets, or \"custom\"" },
        x: vec2Schema,
        y: vec2Schema,
        rotDeg: { type: "number", description: "Rotation in degrees, 0-360" },
        color: { type: "string", description: "Hex color like #5b8def" },
        name: { type: "string" },
        width: { type: "number", description: "Override footprint width (rect footprints only)" },
        depth: { type: "number", description: "Override footprint depth (rect footprints only)" },
        height: { type: "number", description: "Override vertical height for the 3D view" },
        elevation: { type: "number", description: "Override height off the floor" },
      },
      required: ["presetId"],
    },
  },
  {
    name: "update_item",
    description: "Update fields of an existing furniture item by id. Only provided fields are changed.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        x: vec2Schema,
        y: vec2Schema,
        rotDeg: { type: "number" },
        color: { type: "string" },
        name: { type: "string" },
        width: { type: "number" },
        depth: { type: "number" },
        height: { type: "number" },
        elevation: { type: "number" },
        hidden: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "remove_item",
    description: "Delete a furniture item by id.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];
