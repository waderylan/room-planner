/** Formatting/parsing helpers for showing lengths as feet+inches (US units) throughout the UI. */

/** One inch, expressed in feet — the base snap increment for resize/drag interactions. */
export const INCH_FT = 1 / 12;

/** Snap a length in feet to the nearest whole inch. */
export function snapToInch(valueFt: number): number {
  return Math.round(valueFt / INCH_FT) * INCH_FT;
}

/** Split a decimal-feet value into whole feet + whole inches (0-11), rounding to the nearest inch. */
export function feetAndInches(valueFt: number): { feet: number; inches: number } {
  const totalInches = Math.round(valueFt * 12);
  const feet = Math.trunc(totalInches / 12);
  const inches = Math.abs(totalInches % 12);
  return { feet, inches };
}

export function feetInchesToFeet(feet: number, inches: number): number {
  return feet + inches / 12;
}

/** Display form, e.g. `5' 6"` for ft, `1.68 m` for m/other units. */
export function formatLength(valueFt: number, unit: string): string {
  if (unit !== "ft") return `${valueFt.toFixed(2)} ${unit}`;
  const { feet, inches } = feetAndInches(valueFt);
  return `${feet}' ${inches}"`;
}

/** Compact display form (no spaces) for tight canvas labels, e.g. `5'6"`. */
export function formatLengthCompact(valueFt: number, unit: string): string {
  if (unit !== "ft") return `${valueFt.toFixed(2)}${unit}`;
  const { feet, inches } = feetAndInches(valueFt);
  return `${feet}'${inches}"`;
}
