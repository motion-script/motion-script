// Side-effect imports: each implementation registers its handler with
// AudioFilterRegistry at module load, so importing this barrel populates the
// registry. Keep these as value imports (not `import type`) so they aren't erased.
import "./implementations/gain";
import "./implementations/highpass";
import "./implementations/lowpass";
import "./implementations/tremolo";
import "./implementations/speed";
import "./implementations/echo";

/** Audio-filter data types for each built-in filter. */
export type { GainFilter } from './implementations/gain';
export type { HighPassFilter } from './implementations/highpass';
export type { LowPassFilter } from './implementations/lowpass';
export type { TremoloFilter } from './implementations/tremolo';
export type { SpeedFilter } from './implementations/speed';
export type { EchoFilter } from './implementations/echo';

/** Chainable filter builder API, chain class, and union input type. */
export { AFX, AudioFilterChain, resolveAudioFilters } from './chain';
export type { ChainableAfx } from './chain';

/** Union of all concrete audio-filter types accepted by sounds. */
export type { AudioFilter } from './union';

/** Interpolation/equality registry and contract. */
export { AudioFilterRegistry } from './registry';
export type { AudioFilterData } from './registry';
