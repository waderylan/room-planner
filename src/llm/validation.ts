import { TOOLS } from "./tools";

/** Tool calls cross an untrusted model boundary. Validate the complete call before any mutation. */
export function validateToolInput(name: string, input: unknown): asserts input is Record<string, unknown> {
  const definition = TOOLS.find((tool) => tool.name === name);
  if (!definition) throw new Error(`Unknown tool "${name}".`);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool arguments must be an object.");
  const values = input as Record<string, unknown>;
  for (const key of definition.parameters.required ?? []) {
    if (!Object.hasOwn(values, key)) throw new Error(`Missing required field "${key}".`);
  }
  for (const [key, value] of Object.entries(values)) {
    const schema = definition.parameters.properties?.[key];
    if (!schema) throw new Error(`Unknown field "${key}" for ${name}.`);
    if (typeof value !== schema.type) throw new Error(`"${key}" must be a ${schema.type}.`);
    if (schema.enum && !schema.enum.includes(value as string | number)) throw new Error(`Invalid "${key}".`);
    if (typeof value === "string" && (!value.trim() || value.length > 200)) throw new Error(`Invalid "${key}".`);
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > 10_000) throw new Error(`Invalid "${key}".`);
      if (["width", "length", "depth", "notchWidth", "notchDepth"].includes(key) && (value < 0.001 || value > 1_000)) throw new Error(`"${key}" must be between 0.001 and 1000.`);
      if (["x", "y"].includes(key) && Math.abs(value) > 4_000) throw new Error(`"${key}" is outside supported coordinates.`);
      if (name === "set_room_shape" && ["width", "length"].includes(key) && value < 0.1) throw new Error(`"${key}" must be at least 0.1.`);
      if (["height", "elevation", "sillHeight", "offset", "gap"].includes(key) && (value < 0 || value > 1_000)) throw new Error(`"${key}" must be between zero and 1000.`);
      if (key === "height" && ["set_ceiling", "add_opening"].includes(name) && value === 0) throw new Error('"height" must be greater than zero.');
      if (key === "height" && name === "set_ceiling" && value < 0.1) throw new Error('"height" must be at least 0.1.');
      if (key === "height" && name === "add_opening" && value < 0.001) throw new Error('"height" must be at least 0.001.');
      if (key === "wallIndex" && (!Number.isInteger(value) || value < 0)) throw new Error('"wallIndex" must be a non-negative integer.');
    }
    if (key === "color" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error('"color" must be a six-digit hex color.');
  }
  if (name === "set_room_shape" && values.kind === "lshape") {
    if (typeof values.notchWidth === "number" && values.notchWidth >= (values.width as number)) throw new Error("The notch must be narrower than the room.");
    if (typeof values.notchDepth === "number" && values.notchDepth >= (values.length as number)) throw new Error("The notch must be shorter than the room.");
  }
}
