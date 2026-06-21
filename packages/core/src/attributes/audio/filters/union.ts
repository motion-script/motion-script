import type { GainFilter } from "./implementations/gain";
import type { HighPassFilter } from "./implementations/highpass";
import type { LowPassFilter } from "./implementations/lowpass";
import type { TremoloFilter } from "./implementations/tremolo";
import type { SpeedFilter } from "./implementations/speed";
import type { EchoFilter } from "./implementations/echo";
import { paramKey } from "./curve";

/** Discriminated union of every audio-filter type a sound clip can carry. */
export type AudioFilter =
    | GainFilter
    | HighPassFilter
    | LowPassFilter
    | TremoloFilter
    | SpeedFilter
    | EchoFilter;

/**
 * Deterministic string key for a filter chain, including time-varying curve params.
 *
 * Playback identity must change when filters change so the audio device tears down
 * the old source and rebuilds the graph (otherwise an edited volume/filter keeps
 * playing the stale source until the next stop/start). Keyed via {@link paramKey}
 * so two chains with identical curves collapse to the same string.
 */
export function filtersKey(filters: readonly AudioFilter[] | undefined): string {
    if (!filters || filters.length === 0) return "";
    return filters.map((f) => {
        switch (f.type) {
            case "gain":
            case "speed":
                return `${f.type}:${paramKey(f.value)}`;
            case "highpass":
            case "lowpass":
                return `${f.type}:${paramKey(f.frequency)}:${paramKey(f.q)}`;
            case "tremolo":
                return `tremolo:${paramKey(f.rate)}:${paramKey(f.depth)}`;
            case "echo":
                return `echo:${paramKey(f.delay)}:${paramKey(f.feedback)}:${paramKey(f.mix)}`;
        }
    }).join("|");
}
