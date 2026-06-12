import { AudioFilter } from "@/attributes/audio/filters/union";

/** Interpolation and equality contract every registered audio filter must implement. */
export interface AudioFilterData<T extends AudioFilter> {
    /** Return a new filter linearly interpolated between `from` and `to` at progress `t` (0–1). */
    lerp(from: T, to: T, t: number): T;
    /** Return true when both filters are audibly identical (used to skip redundant work). */
    equals(a: T, b: T): boolean;
}

/**
 * Central registry that maps audio-filter type strings to their `AudioFilterData`
 * handlers.
 *
 * Each filter implementation file calls `AudioFilterRegistry.register` at module
 * load time, so the registry is populated as a side effect of importing that
 * module (see the side-effect imports in this package's `index.ts`).
 */
export class AudioFilterRegistry {
    private static registry = new Map<string, AudioFilterData<AudioFilter>>();

    /**
     * Register a filter type.
     * Throws if the same `type` key is registered more than once to catch accidental double-imports.
     */
    static register<T extends AudioFilter>(type: string, data: AudioFilterData<T>): void {
        if (this.registry.has(type)) {
            throw new Error(`Audio filter "${type}" is already registered`);
        }
        this.registry.set(type, data as AudioFilterData<AudioFilter>);
    }

    /** Look up the `AudioFilterData` for a given type key, or `undefined` if not registered. */
    static get(type: string): AudioFilterData<AudioFilter> | undefined {
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
    static lerp(from: AudioFilter, to: AudioFilter, t: number): AudioFilter {
        if (from.type !== to.type) return t < 0.5 ? from : to;
        const data = this.registry.get(from.type);
        return data ? data.lerp(from, to, t) : (t < 0.5 ? from : to);
    }

    /**
     * Interpolate between two filter arrays of potentially different lengths.
     * Indices present in only one array are kept as-is; matched indices are lerped pairwise.
     */
    static lerpArray(from: AudioFilter[], to: AudioFilter[], t: number): AudioFilter[] {
        const maxLen = Math.max(from.length, to.length);
        const result: AudioFilter[] = [];
        for (let i = 0; i < maxLen; i++) {
            const a = from[i];
            const b = to[i];
            if (a && b) {
                result.push(AudioFilterRegistry.lerp(a, b, t));
            } else if (a) {
                result.push(a);
            } else if (b) {
                result.push(b);
            }
        }
        return result;
    }
}
