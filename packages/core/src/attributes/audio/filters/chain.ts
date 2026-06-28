import { AudioFilter } from "./union";
import { Param } from "./curve";

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
 * const chain = AudioFilters.gain(1.5).lowpass(800).echo(0.3, 0.4);
 * this.playSound('song.mp3', { filters: chain }); // assign directly
 * this.playSound('song.mp3', { filters: AudioFilters.volume(fadeIn(0.5).fadeOut(1)) }); // animated
 */
export class AudioFilterChain {
  constructor(public list: AudioFilter[] = []) { }

  /** Append a gain (volume) filter; `value` 1 = unchanged, 0 = silent, >1 = louder. */
  gain(value: Param) {
    return new AudioFilterChain([...this.list, { type: 'gain', value }]);
  }

  /** Alias for {@link gain}; reads naturally for volume automation (`volume(fadeIn(0.5))`). */
  volume(value: Param) {
    return this.gain(value);
  }

  /** Append a high-pass filter; rolls off content below `frequency` Hz. */
  highpass(frequency: Param, q?: Param) {
    return new AudioFilterChain([...this.list, { type: 'highpass', frequency, q }]);
  }

  /** Append a low-pass filter; rolls off content above `frequency` Hz. */
  lowpass(frequency: Param, q?: Param) {
    return new AudioFilterChain([...this.list, { type: 'lowpass', frequency, q }]);
  }

  /** Append a tremolo; `rate` Hz wobble at `depth` (0–1) modulation depth. */
  tremolo(rate: Param, depth: Param) {
    return new AudioFilterChain([...this.list, { type: 'tremolo', rate, depth }]);
  }

  /** Append a speed change; `value` is the playback-rate multiplier (alters pitch). */
  speed(value: Param) {
    return new AudioFilterChain([...this.list, { type: 'speed', value }]);
  }

  /** Append an echo; `delay` seconds, `feedback` 0–<1, optional wet `mix` 0–1. */
  echo(delay: Param, feedback: Param, mix?: Param) {
    return new AudioFilterChain([...this.list, { type: 'echo', delay, feedback, mix }]);
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
 * Accepted shapes for a sound's `filters` prop.
 * Can be a single filter, a plain array, or an `AudioFilterChain` builder result.
 */
export type ChainableAfx = AudioFilter[] | AudioFilterChain | AudioFilter;

const createChain = (list: AudioFilter[] = []): AudioFilterChain => new AudioFilterChain(list);

/**
 * Entry points for building audio-filter chains fluently.
 *
 * @example
 * this.playSound('song.mp3', { filters: AudioFilters.gain(1.5).lowpass(800) });
 */
export const AudioFilters = {
  gain: (value: Param) => createChain([{ type: 'gain', value }]),
  /** Alias for {@link AudioFilters.gain}; reads naturally for volume automation. */
  volume: (value: Param) => createChain([{ type: 'gain', value }]),
  highpass: (frequency: Param, q?: Param) => createChain([{ type: 'highpass', frequency, q }]),
  lowpass: (frequency: Param, q?: Param) => createChain([{ type: 'lowpass', frequency, q }]),
  tremolo: (rate: Param, depth: Param) => createChain([{ type: 'tremolo', rate, depth }]),
  speed: (value: Param) => createChain([{ type: 'speed', value }]),
  echo: (delay: Param, feedback: Param, mix?: Param) =>
    createChain([{ type: 'echo', delay, feedback, mix }]),
};

/**
 * Normalises any `ChainableAfx` value to a plain `AudioFilter[]`.
 * Used internally when reading props before scheduling or interpolation.
 */
export function resolveAudioFilters(filters: ChainableAfx | undefined): AudioFilter[] {
  if (filters === undefined) return [];
  if (filters instanceof AudioFilterChain) return filters.list;
  if (Array.isArray(filters)) return filters;
  return [filters];
}
