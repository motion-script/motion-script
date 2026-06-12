import type { GainFilter } from "./implementations/gain";
import type { HighPassFilter } from "./implementations/highpass";
import type { LowPassFilter } from "./implementations/lowpass";
import type { TremoloFilter } from "./implementations/tremolo";
import type { SpeedFilter } from "./implementations/speed";
import type { EchoFilter } from "./implementations/echo";

/** Discriminated union of every audio-filter type a sound clip can carry. */
export type AudioFilter =
    | GainFilter
    | HighPassFilter
    | LowPassFilter
    | TremoloFilter
    | SpeedFilter
    | EchoFilter;
