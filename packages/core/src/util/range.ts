/**
 * Generates an array of numbers.
 *
 * - `range(n)` → `[0, 1, …, n-1]`
 * - `range(from, to)` → integers from `from` up to (not including) `to`
 * - `range(from, to, step)` → same but incremented by `step`; a negative
 *   `step` counts downward (e.g. `range(5, 0, -1)` → `[5, 4, 3, 2, 1]`)
 */
export function range(length: number): number[]
export function range(from: number, to: number): number[]
export function range(from: number, to: number, step: number): number[]
export function range(fromOrLength: number, to?: number, step = 1): number[] {
  if (to === undefined) {
    return Array.from({ length: fromOrLength }, (_, i) => i)
  }
  const result: number[] = []
  for (let i = fromOrLength; step > 0 ? i < to : i > to; i += step) {
    result.push(i)
  }
  return result
}
