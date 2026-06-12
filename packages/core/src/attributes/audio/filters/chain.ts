import { AudioFilter } from "./union";

/**
 * Immutable, chainable list of audio filters.
 *
 * Each builder method returns a new `AudioFilterChain` with the filter appended,
 * so chains are safe to share and branch. Filters apply in array order
 * (index 0 is closest to the source).
 *
 * @example
 * const afx = AFX.gain(1.5).lowpass(800).echo(0.3, 0.4);
 * this.playSound('song.mp3', { filters: afx }); // assign directly
 * this.playSound('song.mp3', { filters: [...afx, { type: 'gain', value: 2 }] }); // spread
 */
export class AudioFilterChain {
  constructor(public list: AudioFilter[] = []) { }

  /** Append a gain (volume) filter; `value` 1 = unchanged, 0 = silent, >1 = louder. */
  gain(value: number) {
    return new AudioFilterChain([...this.list, { type: 'gain', value }]);
  }

  /** Append a high-pass filter; rolls off content below `frequency` Hz. */
  highpass(frequency: number, q?: number) {
    return new AudioFilterChain([...this.list, { type: 'highpass', frequency, q }]);
  }

  /** Append a low-pass filter; rolls off content above `frequency` Hz. */
  lowpass(frequency: number, q?: number) {
    return new AudioFilterChain([...this.list, { type: 'lowpass', frequency, q }]);
  }

  /** Append a tremolo; `rate` Hz wobble at `depth` (0–1) modulation depth. */
  tremolo(rate: number, depth: number) {
    return new AudioFilterChain([...this.list, { type: 'tremolo', rate, depth }]);
  }

  /** Append a speed change; `value` is the playback-rate multiplier (alters pitch). */
  speed(value: number) {
    return new AudioFilterChain([...this.list, { type: 'speed', value }]);
  }

  /** Append an echo; `delay` seconds, `feedback` 0–<1, optional wet `mix` 0–1. */
  echo(delay: number, feedback: number, mix?: number) {
    return new AudioFilterChain([...this.list, { type: 'echo', delay, feedback, mix }]);
  }

  /** Allows spreading the chain into an array: `[...AFX.gain(2)]`. */
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
 * this.playSound('song.mp3', { filters: AFX.gain(1.5).lowpass(800) });
 */
export const AFX = {
  gain: (value: number) => createChain([{ type: 'gain', value }]),
  highpass: (frequency: number, q?: number) => createChain([{ type: 'highpass', frequency, q }]),
  lowpass: (frequency: number, q?: number) => createChain([{ type: 'lowpass', frequency, q }]),
  tremolo: (rate: number, depth: number) => createChain([{ type: 'tremolo', rate, depth }]),
  speed: (value: number) => createChain([{ type: 'speed', value }]),
  echo: (delay: number, feedback: number, mix?: number) =>
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
