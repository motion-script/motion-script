export { AudioDemoScene } from "./audio-demo";
export type { AudioDemoSpec } from "./audio-demo";

// One scene per filter.
export { OriginalScene } from "./original";
export { GainScene } from "./gain";
export { LowPassScene } from "./lowpass";
export { HighPassScene } from "./highpass";
export { TremoloScene } from "./tremolo";
export { SpeedScene } from "./speed";
export { EchoScene } from "./echo";

// Filters chained on one clip.
export { MultipleFiltersScene } from "./multiple-filters";

// Audio-API usage patterns.
export { PlaySoundScene } from "./play-sound";
export { StartStopSoundScene } from "./start-stop-sound";
export { MultipleSoundsScene } from "./multiple-sounds";
