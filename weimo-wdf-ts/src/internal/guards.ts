/** Narrowing helpers shared by the validator and adapters. */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Mirrors serde's `u8`: an integer in 0..=255. */
export function isU8(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

/** Mirrors serde's `u32`: an integer in 0..=4294967295. */
export function isU32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4294967295
  );
}
