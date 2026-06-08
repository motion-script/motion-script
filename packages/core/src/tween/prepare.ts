import type { Signal } from "@/signals/signal";

/**
 * Snapshots the current numeric property values on `target` for the keys
 * present in `to`, then returns a lerp callback that writes interpolated values
 * back each frame.
 *
 * The snapshot is taken at call time, so invoke this immediately before the
 * animation starts (not lazily) to capture the correct `from` state.
 *
 * @param target - The object whose properties will be animated.
 * @param to     - Desired end values keyed by property name. Keys with
 *                 `undefined` values are ignored.
 * @returns A function `(t: number) => void` that writes `lerp(from, to, t)`
 *          for each key. `t` must already be eased by the caller.
 */
export function prepareNumericTween<T extends object>(
    target: T,
    to: Partial<Record<keyof T, number>>,
): (t: number) => void {
    const keys = (Object.keys(to) as (keyof T)[]).filter((k) => to[k] !== undefined);
    const from = new Array<number>(keys.length);
    const end = new Array<number>(keys.length);
    for (let i = 0; i < keys.length; i++) {
        from[i] = (target as any)[keys[i]] as number;
        end[i] = to[keys[i]] as number;
    }
    return (t: number) => {
        for (let i = 0; i < keys.length; i++) {
            (target as any)[keys[i]] = from[i] + (end[i] - from[i]) * t;
        }
    };
}

/**
 * Like {@link prepareNumericTween}, but bypasses property setters and writes
 * directly to the backing {@link Signal} cells.
 *
 * Skipping the setter avoids the mapper-lookup and `_writeProp` indirection on
 * every frame step. Only valid for numeric, mapper-free properties — the caller
 * is responsible for resolving the signal cells and capturing the `from`/`end`
 * values before calling this.
 *
 * - `cells[i]` — the signal cell for the i-th animated property.
 * - `from[i]`  — start value for that property.
 * - `end[i]`   — end value for that property.
 *
 * The arrays are captured by the returned closure and reused each step, so the
 * per-frame cost is one `cell.set(number)` per property with no allocation.
 */
export function prepareNumericCellTween(
    cells: Signal<number>[],
    from: number[],
    end: number[],
): (t: number) => void {
    return (t: number) => {
        for (let i = 0; i < cells.length; i++) {
            cells[i].set(from[i] + (end[i] - from[i]) * t);
        }
    };
}
