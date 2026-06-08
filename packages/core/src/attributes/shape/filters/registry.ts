import { MediaFilter } from "@/attributes/shape/filters/union";

/** Interpolation and equality contract every registered filter must implement. */
export interface FilterData<T extends MediaFilter> {
    /** Return a new filter linearly interpolated between `from` and `to` at progress `t` (0–1). */
    lerp(from: T, to: T, t: number): T;
    /** Return true when both filters are visually identical (used to skip redundant redraws). */
    equals(a: T, b: T): boolean;
}

/**
 * Central registry that maps filter type strings to their `FilterData` handlers.
 *
 * Each filter implementation file calls `FilterRegistry.register` at module load time
 * so the registry is populated as a side effect of importing that module.
 */
export class FilterRegistry {
    private static registry = new Map<string, FilterData<MediaFilter>>();

    /**
     * Register a filter type.
     * Throws if the same `type` key is registered more than once to catch accidental double-imports.
     */
    static register<T extends MediaFilter>(type: string, data: FilterData<T>): void {
        if (this.registry.has(type)) {
            throw new Error(`Filter "${type}" is already registered`);
        }
        this.registry.set(type, data as FilterData<MediaFilter>);
    }

    /** Look up the `FilterData` for a given type key, or `undefined` if not registered. */
    static get(type: string): FilterData<MediaFilter> | undefined {
        return this.registry.get(type);
    }

    /** Return true when a filter type has been registered. */
    static has(type: string): boolean {
        return this.registry.has(type);
    }

    /**
     * Interpolate between two individual filters at progress `t`.
     * Falls back to a hard cut at t = 0.5 when the types differ or are unregistered.
     */
    static lerp(from: MediaFilter, to: MediaFilter, t: number): MediaFilter {
        if (from.type !== to.type) return t < 0.5 ? from : to;
        const data = this.registry.get(from.type);
        return data ? data.lerp(from, to, t) : (t < 0.5 ? from : to);
    }

    /**
     * Interpolate between two filter arrays of potentially different lengths.
     * Indices present in only one array are kept as-is; matched indices are lerped pairwise.
     */
    static lerpArray(from: MediaFilter[], to: MediaFilter[], t: number): MediaFilter[] {
        const maxLen = Math.max(from.length, to.length);
        const result: MediaFilter[] = [];
        for (let i = 0; i < maxLen; i++) {
            const a = from[i];
            const b = to[i];
            if (a && b) {
                result.push(FilterRegistry.lerp(a, b, t));
            } else if (a) {
                result.push(a);
            } else if (b) {
                result.push(b);
            }
        }
        return result;
    }
}
