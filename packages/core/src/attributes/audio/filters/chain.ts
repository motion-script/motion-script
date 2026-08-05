import { AudioFilterItem } from "./union";
import { Param, isCurve } from "./curve";

/**
 * Audio filters follow the same one-argument rule as scene effects and media
 * filters: every builder takes a single options object, and those with one
 * dominant param also accept that param directly.
 *
 * The shorthand admits a whole {@link Param} — a constant `number` *or* a
 * {@link Curve} — so `AudioFilters.volume(fadeIn(0.5))` still works.
 */

/** Gain / volume. Param shorthand sets `value`. */
export interface GainFilterOptions {
    /** 1 = unchanged, 0 = silent, >1 = louder. */
    value: Param;
}

/** High-pass filter. Param shorthand sets `frequency`. */
export interface HighPassFilterOptions {
    /** Rolls off content below this frequency, in Hz. */
    frequency: Param;
    /** Resonance at the cutoff (default 1). */
    q?: Param;
}

/** Low-pass filter. Param shorthand sets `frequency`. */
export interface LowPassFilterOptions {
    /** Rolls off content above this frequency, in Hz. */
    frequency: Param;
    /** Resonance at the cutoff (default 1). */
    q?: Param;
}

/** Amplitude wobble. Param shorthand sets `rate`. */
export interface TremoloFilterOptions {
    /** Wobble rate in Hz. */
    rate: Param;
    /** Modulation depth, 0–1 (default 0.5). */
    depth?: Param;
}

/** Playback-rate change (alters pitch). Param shorthand sets `value`. */
export interface SpeedFilterOptions {
    /** Playback-rate multiplier. */
    value: Param;
}

/** Delay line with feedback. Param shorthand sets `delay`. */
export interface EchoFilterOptions {
    /** Delay time in seconds. */
    delay: Param;
    /** Feedback amount, 0–<1 (default 0.4). */
    feedback?: Param;
    /** Wet mix, 0–1 (default 0.5). */
    mix?: Param;
}

/**
 * Normalise a `Param | Options` argument onto its dominant field.
 *
 * A {@link Curve} is an object, so the discriminator can't be a bare
 * `typeof === 'number'` — it must ask {@link isCurve} too, or an animated
 * shorthand would be mistaken for an options bag.
 */
function scalarParam<O extends object>(arg: Param | O, key: keyof O): O {
    return typeof arg === "number" || isCurve(arg as Param) ? ({ [key]: arg } as O) : (arg as O);
}

/**
 * Immutable, chainable list of audio filters.
 *
 * Each builder method returns a new `AudioFilterChain` with the filter appended,
 * so chains are safe to share and branch. Filters apply in array order
 * (index 0 is closest to the source).
 *
 * Every numeric param accepts either a constant `number` or a time-varying
 * {@link Param} curve (see `ramp`/`fadeIn`/`fadeOut`), so any filter can animate:
 *
 * @example
 * const chain = AudioFilters.gain(1.5).lowpass(800).echo(0.3);
 * this.playSound('song.mp3', { filters: chain }); // assign directly
 * this.playSound('song.mp3', { filters: AudioFilters.volume(fadeIn(0.5).fadeOut(1)) }); // animated
 */
export class AudioFilterChain {
  constructor(public list: AudioFilterItem[] = []) { }

  private append(filter: AudioFilterItem): AudioFilterChain {
    return new AudioFilterChain([...this.list, filter]);
  }

  /** Append a gain (volume) filter. */
  gain(options: Param | GainFilterOptions) {
    const { value } = scalarParam(options, "value");
    return this.append({ type: 'gain', value });
  }

  /** Alias for {@link gain}; reads naturally for volume automation (`volume(fadeIn(0.5))`). */
  volume(options: Param | GainFilterOptions) {
    return this.gain(options);
  }

  /** Append a high-pass filter; rolls off content below `frequency` Hz. */
  highpass(options: Param | HighPassFilterOptions) {
    const { frequency, q } = scalarParam(options, "frequency");
    return this.append({ type: 'highpass', frequency, q });
  }

  /** Append a low-pass filter; rolls off content above `frequency` Hz. */
  lowpass(options: Param | LowPassFilterOptions) {
    const { frequency, q } = scalarParam(options, "frequency");
    return this.append({ type: 'lowpass', frequency, q });
  }

  /** Append a tremolo; `rate` Hz wobble at `depth` (0–1) modulation depth. */
  tremolo(options: Param | TremoloFilterOptions) {
    const { rate, depth } = scalarParam(options, "rate");
    return this.append({ type: 'tremolo', rate, depth: depth ?? 0.5 });
  }

  /** Append a speed change; the playback-rate multiplier (alters pitch). */
  speed(options: Param | SpeedFilterOptions) {
    const { value } = scalarParam(options, "value");
    return this.append({ type: 'speed', value });
  }

  /** Append an echo; `delay` seconds, `feedback` 0–<1, optional wet `mix` 0–1. */
  echo(options: Param | EchoFilterOptions) {
    const { delay, feedback, mix } = scalarParam(options, "delay");
    return this.append({ type: 'echo', delay, feedback: feedback ?? 0.4, mix });
  }

  /** Allows spreading the chain into an array: `[...AudioFilters.gain(2)]`. */
  *[Symbol.iterator]() {
    yield* this.list;
  }

  /** Serializes to the raw filter array so frameworks that call `toJSON` get a plain value. */
  toJSON() {
    return this.list;
  }
}

/**
 * Accepted shapes for a sound's `filters` prop — the loose, author-facing type.
 * Can be a single filter, a plain array, or an `AudioFilterChain` builder result.
 * Mirrors how `ImageFilter` is the author-facing union in the shape filter system.
 */
export type AudioFilter = AudioFilterItem[] | AudioFilterChain | AudioFilterItem;

/**
 * Entry point for building audio-filter chains fluently.
 *
 * An empty {@link AudioFilterChain}, so `AudioFilters.gain(1.5)` *is*
 * `new AudioFilterChain().gain(1.5)` — every builder's signature and
 * documentation has one definition, on the class, which is what an editor shows
 * when you hover `AudioFilters.gain`. The chain is immutable, so sharing one
 * empty instance as the entry point is safe.
 *
 * @example
 * this.playSound('song.mp3', { filters: AudioFilters.gain(1.5).lowpass(800) });
 */
export const AudioFilters = new AudioFilterChain();

/**
 * Normalises any `AudioFilter` value to a plain `AudioFilterItem[]`.
 * Used internally when reading props before scheduling or interpolation.
 */
export function resolveAudioFilters(filters: AudioFilter | undefined): AudioFilterItem[] {
  if (filters === undefined) return [];
  if (filters instanceof AudioFilterChain) return filters.list;
  if (Array.isArray(filters)) return filters;
  return [filters];
}
