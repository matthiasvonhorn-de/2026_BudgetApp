/**
 * Round to 2 decimal places (cents). Use this for all monetary arithmetic
 * to avoid floating-point drift (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}
